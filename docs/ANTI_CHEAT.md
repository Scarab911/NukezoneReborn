# ANTI-CHEAT & SECURITY ARCHITECTURE — NukezoneReborn

## Threat Model

| Threat | Impact | Mitigations |
|---|---|---|
| Action bots | Optimal 24/7 play — unfair advantage | Behavioral analysis, action rate limits, CAPTCHA triggers |
| Multi-accounting | Farm resources on alt accounts, funnel to main | IP/fingerprint heuristics, transfer monitoring |
| Request replay | Replay a valid action (e.g., collect gold twice) | Idempotency keys, server-side deduplication |
| Race conditions | Exploit timing to duplicate resources | Distributed locks, `FOR UPDATE` row locking |
| Client manipulation | Forge action payloads | Server-authoritative validation — client data is never trusted |
| Economy injection | Generate gold/resources without spending | All resource changes via audited service functions only |
| WS abuse | Flood server with messages | Per-connection rate limiting, message size limits |
| Session hijacking | Steal another player's session | Secure JWT, HTTPS-only, short session TTL |

---

## Idempotency System

Every state-mutating API request must carry an idempotency key. The server deduplicates on this key for 24 hours.

```typescript
// Middleware: src/server/middleware/idempotency.ts

export async function idempotencyMiddleware(
  req: NextRequest,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const idempotencyKey = req.headers.get('x-idempotency-key');
  if (!idempotencyKey) return handler(); // Non-mutating routes don't need this

  const playerId = req.auth?.playerId;
  const redisKey = `idempotency:${playerId}:${idempotencyKey}`;

  // Check if we've already processed this request
  const cached = await redis.get(redisKey);
  if (cached) {
    // Return the cached response — client gets the same result without re-processing
    return NextResponse.json(JSON.parse(cached), { status: 200 });
  }

  // Process and cache result
  const response = await handler();
  const body = await response.json();

  // Cache for 24 hours (TTL matches idempotency window)
  await redis.setex(redisKey, 86400, JSON.stringify(body));

  return NextResponse.json(body, { status: response.status });
}
```

---

## Distributed Lock Anti-Race-Condition

Any operation that reads-then-writes economy data must hold a distributed lock.

```typescript
// src/lib/lock.ts

export async function withLock<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  const lockKey = `lock:${key}`;
  const lockValue = crypto.randomUUID(); // Unique value prevents lock theft

  // SET key value NX PX ttl
  const acquired = await redis.set(lockKey, lockValue, 'NX', 'PX', ttlMs);
  if (!acquired) return null; // Lock already held

  try {
    return await fn();
  } finally {
    // Lua script: only delete if we still own the lock (prevents deleting someone else's lock)
    await redis.eval(
      `if redis.call("get",KEYS[1]) == ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`,
      1, lockKey, lockValue,
    );
  }
}

// Usage in economy service:
const result = await withLock(`nation:${nationId}`, 5000, async () => {
  // Safe — no concurrent modification possible
  return await processResourceChange(nationId, delta);
});
if (!result) throw new LockConflictError('Server busy, retry in a moment');
```

---

## Rate Limiting

Three layers of rate limiting:

### Layer 1: Edge Rate Limiting (Upstash + Vercel Edge)

```typescript
// src/middleware.ts (Next.js Edge Middleware)
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(60, '60s'), // 60 requests per minute global
  analytics: true,
});

export async function middleware(request: NextRequest) {
  const ip = request.ip ?? '127.0.0.1';
  const { success } = await ratelimit.limit(ip);
  if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
}
```

### Layer 2: Per-Action Rate Limiting (API Routes)

```typescript
// Per player, per action type
const ACTION_RATE_LIMITS: Record<string, { requests: number; window: string }> = {
  'military:launch':     { requests: 5,   window: '60s' },   // Max 5 attacks per minute
  'espionage:initiate':  { requests: 2,   window: '60s' },
  'market:create_order': { requests: 10,  window: '60s' },
  'diplomacy:send':      { requests: 3,   window: '60s' },
  'research:start':      { requests: 1,   window: '60s' },
};

async function checkActionRateLimit(playerId: string, action: string): Promise<void> {
  const limit = ACTION_RATE_LIMITS[action];
  if (!limit) return;

  const key = `ratelimit:${playerId}:${action}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, parseInt(limit.window));
  
  if (count > limit.requests) {
    throw new RateLimitError(`Action '${action}' rate limit exceeded`);
  }
}
```

### Layer 3: WebSocket Message Rate Limiting

```typescript
// Per socket connection: max 10 messages/second
const WS_RATE_LIMIT = new Map<string, { count: number; resetAt: number }>();

socket.use(([event, ...args], next) => {
  const now = Date.now();
  const state = WS_RATE_LIMIT.get(socket.id) ?? { count: 0, resetAt: now + 1000 };

  if (now > state.resetAt) {
    state.count = 0;
    state.resetAt = now + 1000;
  }

  state.count++;
  WS_RATE_LIMIT.set(socket.id, state);

  if (state.count > 10) {
    // Silently drop — don't disconnect immediately (could be legitimate reconnect burst)
    return; // Don't call next()
  }

  next();
});
```

---

## Behavioral Scoring System

Every player has a `BehaviorScore` that accumulates signals from various domains. High scores trigger review or automatic sanctions.

```typescript
interface BehaviorSignal {
  type: BehaviorSignalType;
  weight: number;
  decayHours: number; // Signal fades over time
}

const BEHAVIOR_SIGNALS: Record<string, BehaviorSignal> = {
  // Bot indicators
  PERFECT_ACTION_TIMING:    { type: 'BOT', weight: 15, decayHours: 24 },  // Actions at exactly tick intervals
  HIGH_FREQUENCY_ATTACKS:   { type: 'BOT', weight: 20, decayHours: 6 },   // >50 attacks in 1 hour
  NO_BROWSER_FINGERPRINT:   { type: 'BOT', weight: 10, decayHours: 168 }, // Headless browser indicators
  IMPOSSIBLE_REACTION_TIME: { type: 'BOT', weight: 25, decayHours: 24 },  // <100ms response to incoming attack

  // Multi-account indicators
  SAME_IP_MULTIPLE_NATIONS: { type: 'MULTIACCOUNT', weight: 30, decayHours: 168 },
  TRANSFER_TO_NEW_ACCOUNT:  { type: 'MULTIACCOUNT', weight: 25, decayHours: 48 },
  SHARED_DEVICE_FINGERPRINT:{ type: 'MULTIACCOUNT', weight: 35, decayHours: 168 },
  RAPID_SELF_DESTRUCT:      { type: 'MULTIACCOUNT', weight: 20, decayHours: 48 }, // Delete nation, create new

  // Economy abuse
  SUDDEN_WEALTH_SPIKE:      { type: 'ECONOMY', weight: 40, decayHours: 48 },   // Gold 10x in 1 hour
  SYSTEMATIC_MARKET_ARB:    { type: 'ECONOMY', weight: 15, decayHours: 24 },   // Exploiting price gaps
  ALLIANCE_GOLD_FUNNEL:     { type: 'ECONOMY', weight: 35, decayHours: 72 },   // Alt funneling to main
};

async function recordSignal(playerId: string, signalType: string): Promise<void> {
  const signal = BEHAVIOR_SIGNALS[signalType];
  if (!signal) return;

  await prisma.behaviorScore.upsert({
    where: { playerId },
    create: { playerId, score: signal.weight, signals: [{ type: signalType, at: new Date() }] },
    update: {
      score: { increment: signal.weight },
      signals: { push: { type: signalType, at: new Date() } },
    },
  });

  // Check if score crossed enforcement thresholds
  const record = await prisma.behaviorScore.findUniqueOrThrow({ where: { playerId } });
  if (record.score >= 100 && record.score < 150) await flagForReview(playerId);
  if (record.score >= 150) await autoSuspend(playerId, '48h');
  if (record.score >= 250) await autoBan(playerId);
}
```

---

## Economy Anomaly Detection

Runs on WORLD_TICK (hourly). Compares current state to expected ranges.

```typescript
async function detectEconomyAnomalies(worldId: string): Promise<void> {
  const nations = await prisma.nation.findMany({
    where: { worldId },
    include: { resource: true },
  });

  for (const nation of nations) {
    // Check 1: Did gold increase faster than max possible income?
    const maxPossibleGold = calculateMaxPossibleIncome(nation) * (3600 / 30); // 1hr of ticks
    const actualGrowth = nation.resource.gold - (await getGoldOneHourAgo(nation.id));

    if (actualGrowth > maxPossibleGold * 1.5) {
      // 50% above theoretical maximum → anomaly
      await recordSignal(nation.playerId, 'SUDDEN_WEALTH_SPIKE');
      await logEvent(worldId, 'ECONOMY_ANOMALY', {
        nationId: nation.id,
        actualGrowth,
        maxExpected: maxPossibleGold,
        ratio: actualGrowth / maxPossibleGold,
      });
    }

    // Check 2: Did this nation receive large transfers from multiple new nations?
    const recentTransfers = await getRecentIncomingTransfers(nation.id, 24 * 3600 * 1000);
    const transfersFromNewNations = recentTransfers.filter(t => t.senderAge < 24); // < 24hr old
    
    if (transfersFromNewNations.length >= 3) {
      await recordSignal(nation.playerId, 'ALLIANCE_GOLD_FUNNEL');
    }
  }
}
```

---

## Multi-Account Detection

```typescript
async function detectMultiAccounting(playerId: string, request: NextRequest): Promise<void> {
  const ip = request.ip;
  const fingerprint = request.headers.get('x-browser-fingerprint'); // Set by client JS

  // Check: same IP with another active nation
  if (ip) {
    const sameIpPlayers = await redis.smembers(`ip:players:${hashIP(ip)}`);
    await redis.sadd(`ip:players:${hashIP(ip)}`, playerId);

    if (sameIpPlayers.length > 0 && !sameIpPlayers.includes(playerId)) {
      // Different accounts from same IP — flag but don't auto-ban (shared households exist)
      await recordSignal(playerId, 'SAME_IP_MULTIPLE_NATIONS');
    }
  }

  // Check: same browser fingerprint
  if (fingerprint) {
    const existingPlayer = await redis.get(`fingerprint:${fingerprint}`);
    if (existingPlayer && existingPlayer !== playerId) {
      await recordSignal(playerId, 'SHARED_DEVICE_FINGERPRINT');
      // Also flag the other account
      await recordSignal(existingPlayer, 'SHARED_DEVICE_FINGERPRINT');
    }
    await redis.set(`fingerprint:${fingerprint}`, playerId);
  }
}
```

---

## Replay Attack Prevention

Beyond idempotency keys — protect against timing-based replay attacks on WebSocket messages.

```typescript
// Clients include a timestamp with WS messages
// Server rejects messages > 30s old (replay window)

socket.on('client:action', (data: { timestamp: number; payload: unknown }) => {
  const age = Date.now() - data.timestamp;
  if (age > 30_000) {
    socket.emit('error', { code: 'MESSAGE_EXPIRED', message: 'Message timestamp too old' });
    return;
  }
  // Process action
});
```

---

## Input Validation (Zod — all API routes)

```typescript
// Every API route validates input before any business logic
// Example: launch attack endpoint

const LaunchAttackSchema = z.object({
  targetNationId: z.string().cuid(),
  armyId: z.string().cuid(),
  strategy: z.enum(['BLITZ', 'STEALTH', 'SIEGE', 'NUCLEAR']),
}).strict(); // .strict() rejects unknown keys — prevents prototype pollution

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = LaunchAttackSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  // parsed.data is fully typed and safe
  return await militaryService.launchAttack(session.nationId, parsed.data);
}
```

---

## Admin Enforcement Actions

```typescript
type EnforcementAction = 'WARN' | 'MUTE_CHAT' | 'SUSPEND_48H' | 'SUSPEND_7D' | 'BAN_PERMANENT';

async function enforce(playerId: string, action: EnforcementAction, reason: string): Promise<void> {
  await prisma.$transaction([
    prisma.ban.create({ data: { playerId, action, reason, createdAt: new Date() } }),
    prisma.securityEvent.create({ data: { playerId, type: 'ENFORCEMENT', action, reason } }),
  ]);

  if (action === 'BAN_PERMANENT' || action.startsWith('SUSPEND')) {
    // Force disconnect active sessions
    await emitToPlayer(playerId, 'session:terminated', { reason: 'Account action taken' });
    // Invalidate all sessions
    await authService.invalidateAllSessions(playerId);
  }

  // Notify ops team
  await alertOpsChannel({ player: playerId, action, reason });
}
```
