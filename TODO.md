# TODO.md — NukezoneReborn

Last updated: 2026-05-09

---

## Milestones

- [ ] **M1 — Project Foundation** (scaffolding, auth, DB schema, Redis/BullMQ setup)
- [ ] **M2 — Core Game Loop** (tick system, resources, arsenal, basic combat)
- [ ] **M3 — Real-time Layer** (WebSockets, live map, live alerts, offline buffering)
- [ ] **M4 — Full Game Systems** (diplomacy, research, espionage, thief, world events)
- [ ] **M5 — Polish & PWA** (animations, mobile, offline, install prompt)
- [ ] **M6 — Admin & Deployment** (admin panel, monitoring, K8s/Railway deploy)

---

## Pre-M1 Decisions Needed

- [ ] **World model**: Single persistent world vs multiple instances vs seasonal resets?
- [ ] **Map type**: Grid coordinates, hex grid, or abstract (no physical map)?
- [ ] **Tick worker deployment**: Next.js custom server vs standalone process for MVP?

---

## M1 — Project Foundation

### Scaffolding
- [ ] `npx create-next-app@latest` with TypeScript, Tailwind, App Router, src/ dir
- [ ] Install all dependencies (see SESSION_HANDOFF.md for full list)
- [ ] Configure `tsconfig.json` strict mode + path aliases
- [ ] Configure ESLint + Prettier
- [ ] Configure Tailwind v4 + shadcn/ui init
- [ ] Create folder structure: `src/app`, `src/components`, `src/hooks`, `src/lib`, `src/server`, `src/store`, `src/types`
- [ ] Create `.env.local` from `.env.example`
- [ ] Initialize Prisma with PostgreSQL

### Infrastructure Setup
- [ ] `src/lib/redis.ts` — ioredis singleton (main + pub/sub connections)
- [ ] `src/server/queues/index.ts` — BullMQ queues + registerRepeatableJobs()
- [ ] `src/server/workers/index.ts` — worker entry point (starts all workers)
- [ ] `src/lib/lock.ts` — distributed lock utility (withLock)
- [ ] `src/lib/logger.ts` — Pino structured logger
- [ ] `src/server/websocket/index.ts` — Socket.io server with Redis adapter
- [ ] `src/server/websocket/broadcast.ts` — emitToPlayer, emitToWorld, emitToAlliance

### Database Schema (Prisma)
- [ ] Auth models: `Player`, `Account`, `Session`, `VerificationToken`
- [ ] User models: `UserProfile`, `UserSetting`, `Reputation`
- [ ] Game world: `GameWorld` model (if multi-world support)
- [ ] Nation: `Nation`, `MoraleRecord`
- [ ] Economy: `Resource`, `Transaction`, `UpkeepLog`, `BankAccount`, `BankTransaction`, `Loan`
- [ ] Territory: `Territory`, `Zone`, `RadiationZone`, `TerritoryLog`
- [ ] Military: `UnitType` (seed), `Unit`, `UnitTraining`, `Army`, `ArmyMovement`
- [ ] Battle: `Battle`, `BattlePhase`, `BattleReport`, `Casualty`
- [ ] Market: `MarketOrder`, `MarketTrade`, `PriceHistory`
- [ ] Alliance: `Alliance`, `AllianceMember`, `AllianceTreaty`, `AllianceTreasury`, `WarDeclaration`
- [ ] Research: `ResearchProject`, `TechTree` (seed), `TechBonus`, `UnlockedTech`
- [ ] Espionage: `SpyUnit`, `SpyOperation`, `SpyReport`, `CIRating`, `IntelSnapshot`
- [ ] Thief: `ThiefUnit`, `ThiefOperation`, `ThiefReport`
- [ ] Notifications: `Notification`, `PushSubscription`
- [ ] World Events: `WorldEvent`, `EventEffect`
- [ ] Leaderboard: `RankingSnapshot`, `StatHistory`
- [ ] Anti-Cheat: `SecurityEvent`, `BehaviorScore`, `Ban`, `FingerprintRecord`
- [ ] Audit: `GameLog` (append-only)
- [ ] Run initial migration: `prisma migrate dev --name init`
- [ ] Seed: UnitTypes, WeaponTypes, TechTree nodes

### Authentication
- [ ] NextAuth.js v5 with Prisma adapter
- [ ] Credentials provider (email + bcrypt)
- [ ] Discord OAuth provider
- [ ] `/app/(auth)/login/page.tsx`
- [ ] `/app/(auth)/register/page.tsx`
- [ ] `middleware.ts` — protect game routes
- [ ] Post-registration: auto-create Nation (or guided setup flow)

---

## M2 — Core Game Loop

### Tick System
- [ ] `src/server/workers/tick-worker.ts` — FAST_TICK + ECONOMY_TICK handlers
- [ ] `src/server/game-engine/resources.ts` — calculateIncome, calculateUpkeep
- [ ] `src/server/game-engine/starvation.ts` — starvation processing
- [ ] `src/lib/game-constants.ts` — all numeric constants
- [ ] Test: economy tick processes 100 nations in < 25s

### Domain Services (M2 scope)
- [ ] `src/server/services/nation.service.ts`
- [ ] `src/server/services/resource.service.ts` (with transactional transfers)
- [ ] `src/server/services/morale.service.ts`
- [ ] `src/server/services/military.service.ts` (units, training, launch)
- [ ] `src/server/services/territory.service.ts`

### API Routes (M2 scope)
- [ ] `GET /api/game/nation` — fetch own nation snapshot
- [ ] `GET /api/game/arsenal` — list owned units
- [ ] `POST /api/military/train` — start unit training
- [ ] `POST /api/military/launch` — initiate attack (with idempotency key)
- [ ] All routes: auth check + Zod validation + rate limiting

### Battle Engine
- [ ] `src/server/game-engine/battle.ts` — full resolve() function
- [ ] `src/server/game-engine/combat-formulas.ts` — phase calculations
- [ ] `src/server/game-engine/seeded-rng.ts` — Mulberry32 PRNG
- [ ] `src/server/workers/battle-worker.ts` — BullMQ battle queue consumer
- [ ] Test: deterministic — same inputs always produce same output

### Frontend (M2 scope)
- [ ] Game shell layout: `src/app/(game)/layout.tsx` (sidebar, top bar)
- [ ] Dashboard page: nation stats, resources, morale bar
- [ ] Arsenal page: unit list, training queue
- [ ] Basic attack flow: select target → launch dialog → confirm

---

## M3 — Real-time Layer

### WebSocket Full Implementation
- [ ] Player room auth and join on connect
- [ ] Redis pub/sub listener in WS server
- [ ] `emitWithBuffer` — critical events stored in Notification table
- [ ] Reconnect handler: `client:rehydrate` → send missed events
- [ ] Per-connection WS rate limiting (10 msg/s)

### Client WebSocket
- [ ] `src/lib/socket.ts` — singleton with auto-reconnect
- [ ] Route all events to Zustand stores
- [ ] `useSocketInit` hook (called from root layout)
- [ ] `useGameStore.ts` — economy, world events, research
- [ ] `useNotificationStore.ts` — alerts queue
- [ ] `useUIStore.ts` — modal state, sidebar

### Real-time Events (implement in order)
- [ ] `alert:incoming` — incoming attack warning with ETA
- [ ] `economy:update` — partial economy tick push
- [ ] `battle:resolved` — battle completion notification
- [ ] `research:completed` — research done notification
- [ ] `worldevent:started` / `worldevent:ended`
- [ ] `alert:incoming_spy` / `alert:spy_detected`

---

## M4 — Full Game Systems

### Economy Full
- [ ] Banking system: deposit, withdraw, interest (BANK_TICK)
- [ ] Market order book: place/cancel orders, matching engine (MARKET_TICK)
- [ ] Storage limits enforcement
- [ ] Alliance treasury: contribute, withdraw, audit

### Espionage & Thief
- [ ] `src/server/services/espionage.service.ts`
- [ ] `src/server/workers/ops-worker.ts` — espionage + thief resolution
- [ ] Detection formula + false positive (paranoia mechanic)
- [ ] All spy operation types implemented
- [ ] All thief operation types implemented
- [ ] Counter-intelligence building + research bonuses

### Diplomacy
- [ ] Alliance CRUD (create, join, leave, disband)
- [ ] Treaty system: NAP, Trade, Mutual Defense, Full Alliance, War Declaration
- [ ] Treaty expiry via BullMQ delayed jobs
- [ ] Treaty violation blocks Military attacks

### Research
- [ ] Tech tree seeded and queryable
- [ ] Research queue (one active research at a time)
- [ ] Delayed BullMQ job: research completion
- [ ] Apply bonuses on completion (military, economy, espionage)

### World Events
- [ ] World event scheduler (BullMQ)
- [ ] Nuclear Winter trigger (10th nuke detonated)
- [ ] UN Sanctions (scheduled, every 72hrs)
- [ ] Economic Boom (random within window)

### Frontend (M4 scope)
- [ ] Map page with territory visualization
- [ ] Diplomacy page: treaties, alliance, war declarations
- [ ] Research page: tech tree, active research, queue
- [ ] Market page: order book, place/cancel orders, price chart
- [ ] Intel page: spy reports, thief reports, received intel
- [ ] Rankings page (served from Redis sorted set)

---

## M5 — Polish & PWA

### Animations
- [ ] Missile launch arc animation (Framer Motion)
- [ ] Explosion particle effect on detonation
- [ ] Incoming attack urgent pulse animation
- [ ] Page transitions
- [ ] Resource delta animation (number ticking up/down)

### PWA
- [ ] `public/manifest.json`
- [ ] Service worker (next-pwa)
- [ ] Push notification subscription (Web Push API)
- [ ] Push: incoming missile (most critical — must work offline)
- [ ] Offline fallback page
- [ ] Install prompt component

### Mobile
- [ ] Test all pages at 375px viewport
- [ ] Touch-friendly action controls (44px min targets)
- [ ] Swipeable mobile sidebar
- [ ] Mobile map interaction (pinch zoom, tap to select)

---

## M6 — Admin & Deployment

### Admin Panel
- [ ] Admin role gating (`/app/admin/` route group)
- [ ] View all nations, stats, ban players
- [ ] Manually trigger world events
- [ ] View GameLog stream
- [ ] View BullMQ queue depths
- [ ] Economy anomaly alerts dashboard

### Deployment (Phase 1 — Railway)
- [ ] Vercel deployment + env vars
- [ ] Railway PostgreSQL + PgBouncer
- [ ] Railway Redis
- [ ] Railway WS server service
- [ ] Railway game-workers service
- [ ] `prisma migrate deploy` in CI
- [ ] `/api/health` endpoint

### Observability
- [ ] Pino structured logging in all services
- [ ] OpenTelemetry instrumentation
- [ ] Prometheus metrics endpoint
- [ ] Grafana alerts: tick duration, queue depth, error rate

---

## Technical Debt Backlog

- [ ] Rate limiting on ALL API routes (anti-cheat)
- [ ] Idempotency middleware (replay attack prevention)
- [ ] Behavioral scoring system (anti-bot, anti-multiaccount)
- [ ] Economy anomaly detection (WORLD_TICK)
- [ ] Connection pooling (PgBouncer)
- [ ] Leaderboard Redis sorted set (currently query-based placeholder)
- [ ] BattleReport partitioning by month
- [ ] GameLog archival to R2/S3

---

## Completed Tasks

### M1 — Project Foundation ✅
- [x] Project documentation suite (SESSION 1)
- [x] MMO architecture design — all docs in `docs/`
- [x] Next.js 16 + React 19 scaffold
- [x] All game dependencies installed (bullmq, ioredis, socket.io, zod, pino, etc.)
- [x] Prisma v7 configured with `prisma.config.ts` + `@prisma/adapter-pg`
- [x] Full Prisma schema — 17 domain models, 30 enums
- [x] Schema migrated to Supabase via MCP (47 tables)
- [x] `src/lib/db.ts` — Prisma client with pg adapter
- [x] `src/lib/redis.ts` — ioredis singleton
- [x] `src/lib/logger.ts` — Pino structured logger
- [x] `src/lib/lock.ts` — distributed lock utility
- [x] `src/lib/game-constants.ts` — all game balance values
- [x] `src/lib/auth.ts` — NextAuth v5 with Prisma adapter
- [x] `src/server/queues/index.ts` — all 11 BullMQ queues
- [x] `src/server/workers/` — tick, battle, notification worker stubs
- [x] `src/server/websocket/` — Socket.io server + Redis pub/sub broadcast
- [x] `src/middleware.ts` — route protection
- [x] shadcn/ui initialized
- [x] TypeScript — zero errors
- [x] GitHub remote connected + Supabase MCP configured
