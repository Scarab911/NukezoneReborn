# TICK SYSTEM & EVENT ARCHITECTURE — NukezoneReborn

## Design Principle

This is NOT a real-time shooter. The simulation runs in scheduled cycles. Players experience a persistent world where things happen while they sleep. The tick architecture reflects that: different systems run at different frequencies based on their urgency and computational cost.

---

## Tick Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│  FAST_TICK        every 5s    ← missile/army movement       │
│  ECONOMY_TICK     every 30s   ← resources, morale, upkeep   │
│  MARKET_TICK      every 5min  ← order matching, price feed   │
│  BANK_TICK        every 1hr   ← interest, loan payments      │
│  WORLD_TICK       every 1hr   ← rankings, world events       │
│  MAINTENANCE_TICK every 24hr  ← archival, cleanup, analytics │
└─────────────────────────────────────────────────────────────┘

Player-specific delayed jobs (BullMQ):
  - battle resolution    ← scheduled at attack launch time
  - research completion  ← scheduled at research start time
  - spy op resolution    ← scheduled at op initiation time
  - thief op resolution  ← scheduled at op initiation time
  - nuke cooldown expiry ← scheduled after each nuclear launch
  - treaty expiry        ← scheduled at treaty creation time
```

---

## Technology Stack

| Component | Tool | Why |
|---|---|---|
| Job Queue | BullMQ | Built on Redis, durable, supports delayed jobs, retry, priority, rate limiting |
| Repeatable Jobs | BullMQ repeatableJobs | Cron-style repeatable with distributed deduplication |
| Redis | ioredis | BullMQ requires ioredis; also used for locks, cache, pub/sub |
| Distributed Lock | Redis SET NX PX | Prevent concurrent tick execution on same world |

---

## Queue Architecture

```
Redis
├── BullMQ Queues
│   ├── tick:fast           (repeatable, every 5s)
│   ├── tick:economy        (repeatable, every 30s)
│   ├── tick:market         (repeatable, every 5min)
│   ├── tick:bank           (repeatable, every 1hr)
│   ├── tick:world          (repeatable, every 1hr)
│   ├── tick:maintenance    (repeatable, every 24hr)
│   ├── battle:resolve      (delayed — job per battle)
│   ├── research:complete   (delayed — job per research)
│   ├── espionage:resolve   (delayed — job per spy op)
│   ├── thief:resolve       (delayed — job per thief op)
│   ├── notification:send   (immediate, high priority)
│   └── event:scheduled     (delayed — world events)
│
└── BullMQ Workers
    ├── tick-worker.ts       (handles tick:fast, tick:economy)
    ├── market-worker.ts     (handles tick:market, tick:bank)
    ├── world-worker.ts      (handles tick:world, tick:maintenance)
    ├── battle-worker.ts     (handles battle:resolve)
    ├── ops-worker.ts        (handles espionage:resolve, thief:resolve)
    └── notification-worker.ts (handles notification:send)
```

---

## Queue Setup (Code)

```typescript
// src/server/queues/index.ts
import { Queue, Worker, QueueScheduler } from 'bullmq';
import { redis } from '@/lib/redis';

const connection = redis;

export const queues = {
  fastTick:     new Queue('tick:fast',       { connection }),
  economyTick:  new Queue('tick:economy',    { connection }),
  marketTick:   new Queue('tick:market',     { connection }),
  bankTick:     new Queue('tick:bank',       { connection }),
  worldTick:    new Queue('tick:world',      { connection }),
  battle:       new Queue('battle:resolve',  { connection }),
  research:     new Queue('research:complete',{ connection }),
  espionage:    new Queue('espionage:resolve',{ connection }),
  thief:        new Queue('thief:resolve',   { connection }),
  notification: new Queue('notification:send',{ connection, defaultJobOptions: { priority: 1 } }),
};

// Register repeatable jobs (idempotent — safe to call on every server start)
export async function registerRepeatableJobs(): Promise<void> {
  await queues.fastTick.add('fast-tick',     {}, { repeat: { every: 5_000 },   jobId: 'fast-tick' });
  await queues.economyTick.add('economy-tick',{}, { repeat: { every: 30_000 },  jobId: 'economy-tick' });
  await queues.marketTick.add('market-tick', {}, { repeat: { every: 300_000 }, jobId: 'market-tick' });
  await queues.bankTick.add('bank-tick',     {}, { repeat: { every: 3_600_000 },jobId: 'bank-tick' });
  await queues.worldTick.add('world-tick',   {}, { repeat: { every: 3_600_000 },jobId: 'world-tick' });
}
```

---

## FAST_TICK (every 5s)

**Purpose:** Advance all time-sensitive positional game objects.

**Processed By:** `tick-worker.ts`

**Lock:** `redis.SET "lock:fast-tick:{worldId}" 1 NX PX 4900` — skip tick if world already being processed

```typescript
// src/server/workers/tick-worker.ts
async function processFastTick(worldId: string): Promise<void> {
  const lock = await acquireLock(`lock:fast-tick:${worldId}`, 4900);
  if (!lock) return; // Previous tick still running — skip

  try {
    // 1. Advance in-flight missiles
    const activeMissiles = await prisma.missileFlight.findMany({
      where: { worldId, status: 'IN_FLIGHT' },
    });

    for (const missile of activeMissiles) {
      if (Date.now() >= missile.eta.getTime()) {
        // Enqueue battle resolution (not resolved inline — keeps tick fast)
        await queues.battle.add('resolve', { battleId: missile.battleId }, { priority: 2 });
      }
    }

    // 2. Advance army movements
    const activeMovements = await prisma.armyMovement.findMany({
      where: { worldId, status: 'MOVING', eta: { lte: new Date() } },
    });

    for (const movement of activeMovements) {
      await queues.battle.add('resolve', { battleId: movement.battleId }, { priority: 2 });
    }

    // 3. Emit WS tick to active sessions (partial — only affected nations)
    const affectedNationIds = [...new Set([
      ...activeMissiles.map(m => m.targetNationId),
      ...activeMovements.map(m => m.targetNationId),
    ])];

    if (affectedNationIds.length > 0) {
      await notificationService.broadcastToNations(affectedNationIds, { event: 'game:tick', phase: 'fast' });
    }

  } finally {
    await releaseLock(`lock:fast-tick:${worldId}`);
  }
}
```

**What does NOT happen in FAST_TICK:**
- No resource calculations (too expensive, wrong frequency)
- No DB writes to hot tables (beyond status updates)
- No economy mutations

---

## ECONOMY_TICK (every 30s)

**Purpose:** Run the economy simulation — income, upkeep, starvation, morale.

**Critical Design:** Nations are processed in batches with `FOR UPDATE SKIP LOCKED` to allow parallel workers without deadlocks. Each nation's economy is independently transactional.

```typescript
async function processEconomyTick(worldId: string): Promise<void> {
  const lock = await acquireLock(`lock:economy-tick:${worldId}`, 28_000);
  if (!lock) return;

  try {
    // Process nations in parallel batches of 50
    const nations = await prisma.nation.findMany({
      where: { worldId, status: 'ACTIVE' },
      select: { id: true },
    });

    const BATCH_SIZE = 50;
    for (let i = 0; i < nations.length; i += BATCH_SIZE) {
      const batch = nations.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(batch.map(n => processNationEconomyTick(n.id)));
    }

  } finally {
    await releaseLock(`lock:economy-tick:${worldId}`);
  }
}

async function processNationEconomyTick(nationId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Lock this nation's resource row
    const resource = await tx.$queryRaw<Resource[]>`
      SELECT * FROM "Resource" WHERE "nationId" = ${nationId} FOR UPDATE
    `;

    const nation = await tx.nation.findUniqueOrThrow({ where: { id: nationId }, include: { morale: true } });
    const territories = await tx.territory.findMany({ where: { ownerNationId: nationId } });

    const income = economyEngine.calculateIncome(nation, territories[0]);
    const upkeep = economyEngine.calculateUpkeep(nation);

    const goldDelta = income.gold - upkeep.goldCost;
    const newGold = Math.max(0, resource[0].gold + goldDelta);
    const newFood = Math.max(0, resource[0].food + income.food - nation.populationFoodConsumption);

    // Starvation check
    const isStarving = newFood <= 0;
    const moraleDelta = isStarving
      ? MORALE_DELTAS.STARVATION
      : MORALE_DELTAS.REGEN_BASE;

    await tx.resource.update({
      where: { nationId },
      data: {
        gold: newGold,
        food: newFood,
        steel: { increment: income.steel },
        energy: { increment: income.energy - upkeep.energyCost },
      },
    });

    await tx.moraleRecord.update({
      where: { nationId },
      data: { morale: { increment: moraleDelta } },
    });

    await tx.upkeepLog.create({
      data: { nationId, goldCost: upkeep.goldCost, tick: Date.now() },
    });
  });

  // Post-transaction: bust cache, emit WS
  await redis.del(`cache:nation:${nationId}`);
  await notificationService.emitToNation(nationId, { event: 'economy:update' });
}
```

---

## MARKET_TICK (every 5 min)

**Purpose:** Match pending buy/sell orders. Update price history. Cache new prices in Redis.

```typescript
async function processMarketTick(): Promise<void> {
  const resources: ResourceType[] = ['GOLD', 'STEEL', 'FOOD', 'ENERGY'];

  for (const resource of resources) {
    await matchingEngine.matchOrders(resource);
    const latestPrice = await marketService.getLastTradePrice(resource);
    await redis.setex(`market:price:${resource}`, 600, String(latestPrice));
  }

  // Update OHLC candle for current hour
  await priceHistoryService.closeCurrentCandle();
}
```

---

## Delayed Job: Battle Resolution

This is the most critical delayed job. It must be idempotent — if it runs twice, the result should be identical.

```
Timeline:
  T+0ms    Player launches attack
  T+0ms    POST /api/military/launch → creates ArmyMovement, creates Battle{status: PENDING}
  T+0ms    bullmq.add('battle:resolve', { battleId }, { delay: travelTimeMs })
  T+0ms    notification worker fires immediately: INCOMING_ATTACK to target
  
  T+travelMs  BullMQ fires battle:resolve job
  T+travelMs  battleWorker.processBattle(battleId)
  T+travelMs  Battle results persisted, WS emitted to both players
```

```typescript
// src/server/workers/battle-worker.ts
async function processBattle(battleId: string): Promise<void> {
  // Idempotency: if battle already resolved, skip
  const battle = await prisma.battle.findUniqueOrThrow({ where: { id: battleId } });
  if (battle.status !== 'PENDING') return;

  // Acquire per-battle lock (prevents duplicate resolution if job fires twice)
  const lock = await acquireLock(`lock:battle:${battleId}`, 30_000);
  if (!lock) return;

  try {
    const result = await battleEngine.resolve(battleId);

    await prisma.$transaction([
      // Mark battle resolved
      prisma.battle.update({ where: { id: battleId }, data: { status: 'RESOLVED', resolvedAt: new Date() } }),
      // Transfer loot
      ...result.lootTransfers,
      // Apply casualties
      ...result.casualtyUpdates,
      // Transfer territory if applicable
      ...result.territoryTransfers,
      // Create battle report
      prisma.battleReport.create({ data: result.report }),
    ]);

    // Notify both parties
    await queues.notification.add('battle-result', {
      type: 'BATTLE_RESOLVED',
      nationIds: [battle.attackerNationId, battle.defenderNationId],
      reportId: result.report.id,
    });

  } finally {
    await releaseLock(`lock:battle:${battleId}`);
  }
}
```

---

## Timing Diagram

```
REAL TIME ────────────────────────────────────────────────────────────────►

0s          5s          10s         30s                   300s        3600s
│           │           │           │                     │           │
│◄──────────►◄──────────►           │                     │           │
│ FAST_TICK │ FAST_TICK │           │                     │           │
│           │           │           │                     │           │
│           │           │           ◄────────────────────►            │
│           │           │           ECONOMY_TICK(30s)     │           │
│           │           │                                 │           │
│           │           │                                 ◄──────────►
│           │           │                                 MARKET_TICK │
│           │           │                                 (5min)      │
│           │           │                                             │
│           │           │                                             ◄──►
│           │           │                                         BANK_TICK
│           │           │                                         WORLD_TICK
│           │           │                                         (1 hour)
│
│  Player Attack at T+2s
│  ├── API validates, creates Battle{PENDING}
│  ├── BullMQ delayed job scheduled for T+2s + travelTime (e.g. T+182s)
│  ├── Notification worker fires IMMEDIATELY: target gets INCOMING_ATTACK
│  │
│  T+182s: BullMQ fires battle:resolve
│          └── battleEngine.resolve() → results → WS push to both players
```

---

## Nuclear Cooldown System

After a nuclear launch, a delayed BullMQ job enforces a cooldown. No client-side timer — server enforces it.

```typescript
// On nuclear launch:
await queues.research.add('nuke-cooldown-expiry', 
  { nationId, weaponType: 'ICBM' },
  { 
    delay: CONSTANTS.NUKE_COOLDOWN_MS,  // e.g., 3_600_000 (1 hour)
    jobId: `nuke-cooldown:${nationId}`, // Prevent stacking cooldowns
  }
);

// Validation in military service:
const cooldownActive = await bullmq.getJob('nuke-cooldown:' + nationId);
if (cooldownActive) throw new NuclearCooldownError(cooldownActive.opts.delay);
```

---

## Redis Key Conventions

```
cache:nation:{nationId}          → NationSnapshot (TTL: 60s)
cache:market:price:{resource}    → Latest price (TTL: 600s)
cache:leaderboard:{worldId}      → Top 50 sorted set (TTL: 3600s)
lock:fast-tick:{worldId}         → Tick mutex (TTL: 4900ms)
lock:economy-tick:{worldId}      → Economy tick mutex (TTL: 28s)
lock:battle:{battleId}           → Battle resolution mutex (TTL: 30s)
lock:nation:{nationId}           → Nation economy mutation lock (TTL: 5s)
nuke-cooldown:{nationId}         → BullMQ job reference
idempotency:{playerId}:{reqId}   → Request deduplication (TTL: 24hr)
ratelimit:{playerId}:{action}    → Rate limit counter (TTL: 60s)
session:ws:{socketId}            → WS session → nationId mapping (TTL: session)
```

---

## Failure Handling

**If a tick job fails:**
- BullMQ retries with exponential backoff (3 retries, 5s / 25s / 125s)
- After max retries: job moves to `failed` queue, alert fires to ops channel
- Tick resumes on next scheduled run — no cascading failures

**If battle resolution fails:**
- Battle remains `PENDING`
- BullMQ retries up to 5 times
- If all retries fail: battle is force-resolved as DRAW, both parties notified
- Anti-exploit: attacker's army returns home after 30min of PENDING state

**If economy tick is slow:**
- Tick uses `SKIP LOCKED` — it only processes nations it can lock
- Unlocked nations are picked up on next economy tick
- No nation is double-processed within a single tick

**If Redis goes down:**
- Queues pause (BullMQ is Redis-backed)
- Ticks resume when Redis comes back (BullMQ persistent job storage)
- During downtime: API still functions (Postgres is source of truth)
- WS server falls back to HTTP long-polling via Socket.io
