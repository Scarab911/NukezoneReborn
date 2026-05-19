# CHANGELOG.md — NukezoneReborn

All notable changes to this project will be documented in this file.
Format: `## [version or date] — Description`

---

## [2026-05-15] — Major Redesign: Turn-Based Instant Combat

- **Removed**: HP system, territory map, coordinates, travel time, ArmyMovement, food/steel resources
- **Added**: Turn system (50 start, +1/5min, max 100), instant combat resolution (same HTTP response)
- **Added**: 30 unit types across Ground/Air/Sea/Special/Strategic categories
- **Added**: Building model (WAR_FACTORY, AIRFIELD, SHIPYARD, RESEARCH_LAB, POWER_PLANT, MISSILE_SILO, DEFENSE_TOWERS)
- **Changed**: `gold` → `money`, removed `food`/`steel` from Resource model
- **New engine**: `combat.ts` (seeded Mulberry32 RNG, instant resolver), `turns.ts` (regen + spend)
- **New API**: `POST /api/military/attack` (replaces `/launch`), `POST /api/buildings`
- **DB migration**: Applied via Supabase MCP (port 5432 blocked locally)
- Updated all pages: dashboard (turns bar), arsenal (category tabs), military (instant result inline)
- Updated TODO.md, SESSION_HANDOFF.md, AI_RULES.md comprehensively

## [2026-05-14] — M4: Bank, Market, Alliances, Messages

- Bank: deposit/withdraw with 2% fee, transaction history
- Market: order book for money/land/energy, buy/sell orders, cancel with refund
- Alliances: create/join, member roster, treasury display
- Messages: inbox with all notification types, send diplomatic messages
- Research auto-complete: polls every 10s, marks expired IN_PROGRESS as COMPLETED

## [2026-05-13] — M3: Research, Rankings, Military, WebSocket

- Research page: tech tree, live countdown timer, auto-complete
- Rankings page: power score leaderboard with medals
- Military page: nation list, instant attack launch
- WebSocket client singleton: routes events to Zustand stores
- Alert bar: red banner for incoming attacks

## [2026-05-12] — M2: Auth, Dashboard, Arsenal, Nation Setup

- Auth pages: /login, /register (dark military UI)
- Nation setup flow: /setup → color picker → create nation
- Dashboard: HP bar (now turns), morale, resources
- Arsenal: unit list with training form
- Seed data: GameWorld, UnitTypes, TechNodes

## [2026-05-09] — MMO Architecture Design (Phase 2)

- Redesigned entire architecture as production-grade live-service MMO
- Added BullMQ + Redis to tech stack for durable job queues and distributed locking
- Designed all 17 domain modules with explicit service/event/DB ownership boundaries
- Designed 5-tier tick system (fast/economy/market/bank/world ticks) with BullMQ repeatables
- Designed server-authoritative battle engine: phases, seeded RNG, deterministic resolution
- Designed economy engine: non-linear upkeep scaling, storage limits, market order book, inflation prevention
- Designed espionage/thief engine: async operations, false-positive paranoia mechanic, misinformation ops
- Designed WebSocket architecture: Redis pub/sub broadcast, offline buffering, reconnect rehydration
- Designed database scaling: hot/cold table segregation, Postgres partitioning, Redis caching strategy
- Designed anti-cheat: idempotency, distributed locks, behavioral scoring, economy anomaly detection
- Designed 3-phase infrastructure: Railway MVP → Railway scaled → Kubernetes with observability

## [2026-05-09] — Project Initialized

- Created project documentation suite (PROJECT_CONTEXT, ARCHITECTURE, TODO, AI_RULES, ENVIRONMENT_SETUP)
- Defined tech stack: Next.js 15, TypeScript, Tailwind, shadcn/ui, Zustand, TanStack Query, Framer Motion, Socket.io, PostgreSQL, Prisma, NextAuth v5
- Established milestone plan (M1–M6)
- Defined database schema design
- Defined WebSocket event types
- Set architectural decisions: Zustand over Redux, Socket.io over native ws, custom server for WS
- Repository prepared for development start

---

<!-- Future entries above this line -->
