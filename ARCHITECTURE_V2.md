# ARCHITECTURE V2 — NukezoneReborn MMO Engine

> This document supersedes ARCHITECTURE.md.
> It redesigns the project as a production-grade live-service MMO strategy game.

---

## System Philosophy

NukezoneReborn is a **persistent asynchronous MMO strategy game**. This class of game has fundamentally different architectural requirements than a CRUD app or even a real-time action game:

| Property | Implication |
|---|---|
| Persistent world | Game state exists and mutates 24/7, whether players are online or not |
| Asynchronous | Actions complete in the future (attacks travel, research takes hours) |
| Server authoritative | Zero trust on client. Client is a display terminal only |
| Economy-driven | All resource changes must be ACID transactional. No partial updates |
| Event-based | The game is a stream of events, not a CRUD state machine |
| Competitive | Anti-cheat, anti-abuse, and fairness are first-class concerns |

---

## High-Level System Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT TIER                                 │
│                                                                      │
│  Next.js 15 PWA                                                      │
│  ├── React (display only — zero trust)                               │
│  ├── Zustand (UI state + WS event buffer)                            │
│  ├── TanStack Query (REST polling for non-realtime data)             │
│  └── Socket.io Client (receive push events only)                     │
└────────────────────────┬────────────────────────────────────────────┘
                         │ HTTPS / WSS
┌────────────────────────▼────────────────────────────────────────────┐
│                          EDGE / GATEWAY TIER                         │
│                                                                      │
│  ├── Vercel Edge (Next.js SSR, API Routes, static assets)            │
│  ├── Rate Limiting (Upstash Redis @ Edge)                            │
│  └── Auth Middleware (NextAuth session check)                        │
└────────────────────────┬────────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────────┐
│                       APPLICATION TIER                               │
│                                                                      │
│  ├── Next.js API Routes (REST, Server Actions)                       │
│  │    └── Domain Services (one per domain module)                    │
│  │                                                                   │
│  ├── WebSocket Server (Socket.io — separate Node process)            │
│  │    ├── Namespace: /game  (per-world rooms)                        │
│  │    ├── Namespace: /alerts (per-player rooms)                      │
│  │    └── Internal emitter (receives events from workers)            │
│  │                                                                   │
│  └── Game Worker Processes (BullMQ workers)                          │
│       ├── tick-worker (fast tick, economy tick)                      │
│       ├── battle-worker (async battle resolution)                    │
│       ├── espionage-worker (spy/thief resolution)                    │
│       ├── event-worker (world events, scheduled tasks)               │
│       └── notification-worker (push notifications, emails)           │
└────────────────────────┬────────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────────┐
│                         DATA TIER                                    │
│                                                                      │
│  ├── PostgreSQL (primary — Prisma ORM)                               │
│  │    ├── Hot tables (nations, resources, active battles)            │
│  │    ├── Warm tables (market orders, spy ops, research)             │
│  │    └── Cold tables (battle reports, event logs, audit trail)      │
│  │                                                                   │
│  ├── Redis (Upstash or self-hosted)                                  │
│  │    ├── BullMQ job queues                                          │
│  │    ├── Hot game state cache (nation snapshots)                    │
│  │    ├── Leaderboard sorted sets                                    │
│  │    ├── Rate limit counters                                        │
│  │    ├── Distributed locks (tick mutex, battle mutex)               │
│  │    └── Session store (Socket.io adapter)                          │
│  │                                                                   │
│  └── Object Storage (Cloudflare R2 / S3)                             │
│       ├── Battle replay blobs                                        │
│       └── Archived event logs                                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Subsystem Documentation Index

| Document | Contents |
|---|---|
| [docs/DOMAIN_MODULES.md](docs/DOMAIN_MODULES.md) | All 17 domain modules: responsibilities, services, events, DB ownership |
| [docs/TICK_SYSTEM.md](docs/TICK_SYSTEM.md) | Tick architecture, BullMQ queues, scheduling, Redis usage |
| [docs/BATTLE_ENGINE.md](docs/BATTLE_ENGINE.md) | Server-side battle resolution, phases, formulas, replays |
| [docs/ECONOMY_ENGINE.md](docs/ECONOMY_ENGINE.md) | Resource flows, inflation prevention, banking, market |
| [docs/ESPIONAGE_ENGINE.md](docs/ESPIONAGE_ENGINE.md) | Spy/thief operations, detection, counterplay |
| [docs/REALTIME_ARCHITECTURE.md](docs/REALTIME_ARCHITECTURE.md) | WebSocket strategy, room design, event broadcasting |
| [docs/DATABASE_SCALING.md](docs/DATABASE_SCALING.md) | Partitioning, indexing, hot/cold tables, archival |
| [docs/ANTI_CHEAT.md](docs/ANTI_CHEAT.md) | Anti-bot, anti-multiaccounting, economy anomaly detection |
| [docs/DEVOPS.md](docs/DEVOPS.md) | Kubernetes, Redis cluster, CI/CD, observability |

---

## New Technology Additions (vs V1)

| Addition | Purpose |
|---|---|
| **Redis** | BullMQ queues, hot state cache, leaderboard sorted sets, distributed locks |
| **BullMQ** | Durable job queues for all async game actions |
| **Node.js Worker Threads** | CPU-intensive battle calculations off the event loop |
| **Upstash Redis** | Edge-compatible Redis for rate limiting at Vercel Edge |
| **Pino** | Structured JSON logging across all services |
| **OpenTelemetry** | Distributed tracing across Next.js, WS server, workers |

### Updated Dependency List

```bash
# Queue system
npm install bullmq ioredis

# Caching & distributed state
npm install ioredis @upstash/redis @upstash/ratelimit

# Structured logging
npm install pino pino-pretty

# Observability
npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node

# Crypto (battle seeding, idempotency)
npm install uuid

# Job scheduling (for world events)
npm install node-cron
```

---

## Domain Ownership Map

Each domain owns its DB tables. No domain queries another domain's tables directly — it calls the owning domain's service.

```
Domain          Owns Tables
─────────────────────────────────────────────────
Auth            Player, Account, Session, VerificationToken
User            UserProfile, UserSetting, Reputation
Territory       Territory, Zone, RadiationZone, TerritoryLog
Economy         Nation, Resource, Transaction, UpkeepLog
Banking         BankAccount, BankTransaction, Loan
Market          MarketOrder, MarketTrade, PriceHistory
Alliance        Alliance, AllianceMember, AllianceTreaty, AllianceTreasury
Military        Unit, UnitTraining, Army, ArmyMovement
Battle          Battle, BattlePhase, BattleReport, Casualty
Espionage       SpyUnit, SpyOperation, SpyReport, CIRating
Thief           ThiefUnit, ThiefOperation, ThiefReport
Research        ResearchProject, TechTree, TechBonus
Morale          MoraleRecord, MoraleEvent
Notification    Notification, PushSubscription
WorldEvents     WorldEvent, EventEffect
Leaderboard     RankingSnapshot, StatHistory
AntiCheat       SecurityEvent, BehaviorScore, Ban
```

---

## Action Processing Model

Every player action follows this exact pipeline — no exceptions:

```
Player sends HTTP request
        │
        ▼
1. Auth check (NextAuth session → playerId, nationId)
        │
        ▼
2. Rate limit check (Upstash Redis — per player, per action type)
        │
        ▼
3. Idempotency check (Redis: has this requestId been processed?)
        │
        ▼
4. Input validation (Zod schema)
        │
        ▼
5. Acquire distributed lock if needed (Redis SET NX — for economy mutations)
        │
        ▼
6. Business rule validation (service layer — can this player do this?)
        │
        ▼
7. DB transaction (Prisma $transaction — atomic state change)
        │
        ▼
8. Enqueue downstream jobs (BullMQ — delayed resolution, notifications)
        │
        ▼
9. Cache invalidation (Redis — bust stale nation snapshot)
        │
        ▼
10. Return response to client
        │
        ▼
11. (Async, via worker) Resolve jobs, emit WS events to affected players
```

---

## Data Flow: Attack Action (Full Example)

```
Player A clicks "Launch Strike" on Player B

CLIENT:
  POST /api/military/launch
  Body: { targetNationId: "B", armyId: "a1", strategy: "BLITZ" }
  Headers: { "x-idempotency-key": "<uuid>" }

API ROUTE:
  → auth() → session: { playerId: "pA", nationId: "nA" }
  → rateLimiter.check("launch", "pA") → allowed
  → redis.get("idempotency:pA:<uuid>") → null (not duplicate)
  → Zod.parse(body) → valid
  → redis.SET NX "lock:nation:nA" 5000ms → acquired
  → militaryService.validateLaunch(nA, "a1", "B") → valid
  → prisma.$transaction([
      deductFuelCost(nA, cost),
      createArmyMovement({ armyId: "a1", from: nA, to: "B", eta: now + travelMs }),
      createBattle({ attackerId: nA, defenderId: "B", status: PENDING, eta }),
    ])
  → redis.SET "idempotency:pA:<uuid>" 86400s
  → bullmq.add("battle-queue", { battleId }, { delay: travelMs })
  → bullmq.add("notification-queue", { type: "INCOMING_ATTACK", targetNationId: "B", eta })
  → redis.del("lock:nation:nA")
  → return 200 { success: true, battleId, eta }

NOTIFICATION WORKER (immediately):
  → socket.io emit to B's player room: { event: "alert:incoming", eta, attackerName: masked }

BATTLE WORKER (at eta - delayed job):
  → battleEngine.resolve(battleId)
  → persist results
  → socket.io emit to both players: { event: "battle:resolved", reportId }
```
