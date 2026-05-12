# DATABASE SCALING — NukezoneReborn

## Core Design Principles

1. **Postgres as source of truth** — Redis is a cache layer, never the authority
2. **Hot/warm/cold table segregation** — write patterns inform index strategy
3. **Partitioning by worldId** — isolates game worlds at the storage level
4. **Append-only audit log** — immutable event stream for battle history, economy changes
5. **Aggressive indexing on query patterns** — every tick query is profiled

---

## Table Classification

### Hot Tables (high-frequency reads AND writes — every tick)

| Table | Read Pattern | Write Pattern | Strategy |
|---|---|---|---|
| `Resource` | Per-nation (indexed) | Every 30s economy tick | `FOR UPDATE SKIP LOCKED` + index on `nationId` |
| `Nation` | Per-nation (indexed) | Every 30s (morale, HP) | Compound index `(worldId, status)` |
| `MissileFlight` | All active in world | Created on launch, updated on resolution | Index `(worldId, status, eta)` |
| `ArmyMovement` | All active in world | Created on attack, updated on resolution | Index `(worldId, status, eta)` |
| `MoraleRecord` | Per-nation | Every 30s | Colocate with Nation via same `nationId` key |

### Warm Tables (moderate reads and writes)

| Table | Strategy |
|---|---|
| `MarketOrder` | Index `(resource, side, status, pricePerUnit, createdAt)` |
| `SpyOperation` | Index `(status, scheduledAt)` for worker polling |
| `ThiefOperation` | Index `(status, scheduledAt)` |
| `ResearchProgress` | Index `(nationId, status, completesAt)` |
| `Alliance` | Index `(status)`, low write frequency |
| `BankAccount` | Index `(nationId)`, written hourly |

### Cold Tables (rarely written, occasionally read)

| Table | Strategy |
|---|---|
| `BattleReport` | Partitioned by month. Archived after 30 days to object storage |
| `GameLog` | Append-only. Partitioned by week. Never updated |
| `Transaction` | Append-only. Partitioned by month. Archived after 90 days |
| `MarketTrade` | Append-only. Partitioned by month |
| `StatHistory` | Append-only. Partitioned by week |

---

## Schema with Indexes

```prisma
// prisma/schema.prisma (critical indexes shown)

model Nation {
  id          String   @id @default(cuid())
  worldId     String
  playerId    String   @unique
  name        String
  status      NationStatus @default(ACTIVE)
  hp          Int      @default(1000)
  totalUnits  Int      @default(0)
  landCount   Int      @default(10)
  createdAt   DateTime @default(now())

  resource    Resource?
  morale      MoraleRecord?

  @@index([worldId, status])          // ECONOMY_TICK: findMany active nations
  @@index([playerId])                 // Auth lookup
}

model Resource {
  id        String @id @default(cuid())
  nationId  String @unique
  gold      Int    @default(1000)
  food      Int    @default(500)
  steel     Int    @default(200)
  energy    Int    @default(100)
  updatedAt DateTime @updatedAt

  @@index([nationId])                 // Always accessed by nationId
}

model MissileFlight {
  id               String        @id @default(cuid())
  worldId          String
  attackerNationId String
  targetNationId   String
  weaponType       String
  launchedAt       DateTime      @default(now())
  eta              DateTime
  status           FlightStatus  @default(IN_FLIGHT)
  battleId         String        @unique

  @@index([worldId, status, eta])    // FAST_TICK: find all in-flight missiles due for resolution
  @@index([targetNationId, status])  // Alert lookup: "what's coming at me?"
}

model SpyOperation {
  id            String          @id @default(cuid())
  initiatorId   String
  targetId      String
  type          SpyOpType
  status        SpyOpStatus     @default(SCHEDULED)
  scheduledAt   DateTime
  resolvedAt    DateTime?
  spyUnitId     String

  @@index([status, scheduledAt])     // Worker: find ops due for resolution
  @@index([initiatorId, targetId])   // Rate limit check: how many ops against this target?
}

model BattleReport {
  id         String   @id @default(cuid())
  battleId   String   @unique
  createdAt  DateTime @default(now())
  // ... payload stored as JSON blob
  payload    Json

  @@index([createdAt])               // For archival queries
  // Partitioned by createdAt month (Postgres native partitioning)
}

model GameLog {
  id         BigInt   @id @default(autoincrement())  // BigInt for append-only scale
  worldId    String
  eventType  String
  payload    Json
  timestamp  DateTime @default(now())

  @@index([worldId, timestamp])
  @@index([timestamp])               // Archival partition key
}

model MarketOrder {
  id            String       @id @default(cuid())
  nationId      String
  side          OrderSide
  resource      ResourceType
  quantity      Int
  pricePerUnit  Int
  filledQty     Int          @default(0)
  status        OrderStatus  @default(OPEN)
  createdAt     DateTime     @default(now())

  @@index([resource, side, status, pricePerUnit, createdAt])  // Order book query
  @@index([nationId, status])                                  // "My open orders"
}
```

---

## Partitioning Strategy

PostgreSQL range partitioning on `createdAt` for cold tables:

```sql
-- BattleReport partitioned by month
CREATE TABLE "BattleReport" (
  id TEXT,
  "battleId" TEXT UNIQUE,
  payload JSONB,
  "createdAt" TIMESTAMP DEFAULT NOW()
) PARTITION BY RANGE ("createdAt");

CREATE TABLE "BattleReport_2026_01" PARTITION OF "BattleReport"
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE "BattleReport_2026_02" PARTITION OF "BattleReport"
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
-- etc.

-- Partitions older than 30 days are detached and archived to object storage
```

---

## Write Optimization

### ECONOMY_TICK: Processing 1000+ nations efficiently

```sql
-- BAD: SELECT all nations, process one by one
-- This locks rows serially and creates a slow linear scan

-- GOOD: Process in batches with SKIP LOCKED
-- Allows multiple worker processes to handle nations in parallel

SELECT id FROM "Nation"
WHERE "worldId" = $1 AND status = 'ACTIVE'
ORDER BY id
LIMIT 50
FOR UPDATE SKIP LOCKED;
```

### UPSERT for hot write tables

```typescript
// Upkeep logs use INSERT ... ON CONFLICT to prevent duplicate processing
await prisma.$executeRaw`
  INSERT INTO "UpkeepLog" ("nationId", "goldCost", "tick")
  VALUES (${nationId}, ${cost}, ${tickTimestamp})
  ON CONFLICT ("nationId", "tick") DO NOTHING
`;
// This makes the economy tick idempotent — safe to retry
```

### Bulk insert for cascade events

```typescript
// After a large battle, create many casualty records atomically
await prisma.casualty.createMany({
  data: casualties,  // array of 100+ records
  skipDuplicates: true,
});
// createMany uses a single INSERT statement — far faster than looping
```

---

## Caching Layer (Redis)

### What lives in Redis

```typescript
// Nation snapshot cache — most-read piece of game data
const NATION_CACHE_TTL = 60; // seconds
const cacheKey = `cache:nation:${nationId}`;

async function getNationCached(nationId: string): Promise<NationSnapshot> {
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const nation = await prisma.nation.findUniqueOrThrow({
    where: { id: nationId },
    include: { resource: true, morale: true, territories: { take: 1 } },
  });

  await redis.setex(cacheKey, NATION_CACHE_TTL, JSON.stringify(nation));
  return nation;
}

// Invalidation: called after every economy tick and after battles
async function invalidateNationCache(nationId: string): Promise<void> {
  await redis.del(`cache:nation:${nationId}`);
}
```

### Leaderboard in Redis Sorted Set

```typescript
// O(log N) insert, O(log N + K) range query
// Much faster than ORDER BY on large Nation table

async function updateLeaderboard(worldId: string, nationId: string, score: number): Promise<void> {
  await redis.zadd(`leaderboard:${worldId}:power`, score, nationId);
}

async function getTopNations(worldId: string, top = 50): Promise<LeaderboardEntry[]> {
  const entries = await redis.zrevrange(`leaderboard:${worldId}:power`, 0, top - 1, 'WITHSCORES');
  // Parse and return
}

// Full leaderboard rebuild runs on WORLD_TICK (hourly)
// In between: individual scores updated after battles, territory captures
```

---

## Read Optimization

### Read replicas for analytics queries

```
Writes → Primary PostgreSQL
Reads (leaderboard rebuild, analytics, admin panel) → Read Replica

Connection pools:
  primaryDb = new PrismaClient({ datasources: { db: { url: PRIMARY_URL } } });
  replicaDb = new PrismaClient({ datasources: { db: { url: REPLICA_URL } } });

// Game engine workers use primaryDb (must see latest writes)
// Leaderboard worker uses replicaDb (slight lag acceptable)
// Admin analytics use replicaDb (no impact on game write path)
```

### Connection Pooling

```typescript
// Use PgBouncer (connection pooler) between app and Postgres
// Without it: 100 concurrent API requests = 100 Postgres connections = resource exhaustion
// With PgBouncer: connections are pooled, max 20–50 actual Postgres connections needed

// Railway/Fly: PgBouncer available as sidecar
// Self-hosted: run PgBouncer container alongside Postgres
```

---

## Append-Only Audit Log

The `GameLog` table is an immutable event stream. Never updated, never deleted (until archived).

```typescript
// Every significant game event is logged
async function logEvent(worldId: string, type: GameEventType, payload: unknown): Promise<void> {
  await prisma.gameLog.create({
    data: { worldId, eventType: type, payload: payload as Prisma.JsonObject },
  });
  // This is non-blocking — if it fails, the game action still succeeds
  // Logs are informational, not transactional
}

// Events logged:
type GameEventType =
  | 'BATTLE_RESOLVED'
  | 'NATION_DESTROYED'
  | 'NUKE_DETONATED'
  | 'ALLIANCE_FORMED'
  | 'ALLIANCE_WAR_DECLARED'
  | 'WORLD_EVENT_STARTED'
  | 'ECONOMY_ANOMALY'       // Anti-cheat trigger
  | 'SPY_CAUGHT'
  | 'TREATY_BROKEN';
```

---

## Archival Strategy

```
AGE 0–7 days:    Live in PostgreSQL hot partitions
AGE 7–30 days:   Live in PostgreSQL warm partitions (less frequent index rebuilds)
AGE 30+ days:    Detach partition → export to Parquet → upload to R2/S3 → drop table
```

```typescript
// Runs on MAINTENANCE_TICK (daily)
async function archiveOldData(): Promise<void> {
  const cutoff = subDays(new Date(), 30);
  
  // Export old BattleReports to JSON/Parquet
  const oldReports = await prisma.battleReport.findMany({
    where: { createdAt: { lt: cutoff } },
  });
  
  if (oldReports.length > 0) {
    await objectStorage.upload(`archives/battle-reports/${format(cutoff, 'yyyy-MM')}.json`, oldReports);
    await prisma.battleReport.deleteMany({ where: { createdAt: { lt: cutoff } } });
  }

  // Same for GameLog, Transaction, MarketTrade
}
```

---

## Database Monitoring Queries

Queries to run periodically to detect performance issues:

```sql
-- Find slow queries (pg_stat_statements required)
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Find missing indexes (sequential scans on large tables)
SELECT relname, seq_scan, seq_tup_read, idx_scan
FROM pg_stat_user_tables
WHERE seq_scan > idx_scan AND n_live_tup > 10000
ORDER BY seq_tup_read DESC;

-- Check bloat on hot tables
SELECT tablename, pg_size_pretty(pg_total_relation_size(tablename::regclass))
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(tablename::regclass) DESC
LIMIT 10;

-- Check lock waits (problematic if economy tick is slow)
SELECT pid, wait_event_type, wait_event, state, query
FROM pg_stat_activity
WHERE wait_event_type = 'Lock';
```
