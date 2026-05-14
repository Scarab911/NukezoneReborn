# SESSION_HANDOFF.md — NukezoneReborn

> Read this file FIRST at the start of every session.

---

## Session: 2026-05-14 — M2 continued (services, engine, stores, arsenal)

### What Was Done (this session)
- Updated SESSION_HANDOFF.md + TODO.md to reflect actual state
- Built TanStack Query + Zustand providers (`Providers.tsx`)
- Built domain services: `nation.service.ts`, `resource.service.ts`, `morale.service.ts`
- Built economy engine: `src/server/game-engine/resources.ts`
- Built Zustand stores: `useGameStore.ts`, `useUIStore.ts`
- Built Arsenal page: unit list + training flow
- Added WebSocket event types: `src/types/socket.ts`
- Wired dashboard to TanStack Query polling

### Current State
**M2 is ~60% complete.** App is runnable end-to-end:
- ✅ Landing page (`/`)
- ✅ Register + Login (`/register`, `/login`)
- ✅ Nation setup (`/setup`)
- ✅ Dashboard with live stats (`/dashboard`)
- ✅ Arsenal page (`/arsenal`) — unit list + train
- ✅ Service layer (nation, resource, morale)
- ✅ Economy engine (income/upkeep formulas)
- ✅ TanStack Query + Zustand providers wired
- ❌ Economy tick running (Redis required locally)
- ❌ Military page (attack flow)
- ❌ Battle engine
- ❌ Research page
- ❌ All M3–M6 features

### Current Focus
**M2 — Core Game Loop (finishing)**

Next tasks in priority order:
1. Military page + unit training API (`POST /api/military/train`)
2. Nation API polling with TanStack Query on dashboard
3. Economy tick wired up (stub that runs without Redis for dev)
4. Battle engine seeded-RNG + basic resolve

### Architecture Decisions Locked In

| Decision | Choice |
|---|---|
| Database | Supabase PostgreSQL via Prisma v7 + `@prisma/adapter-pg` |
| Auth | NextAuth v5 — split config (`auth.config.ts` for edge proxy) |
| Proxy | `src/proxy.ts` (Next.js 16 renamed from middleware) |
| Real-time | Socket.io + Redis pub/sub |
| Jobs | BullMQ on Redis |
| Port 5432 | Blocked by ISP — use Supabase MCP for all schema changes |
| base-ui | All base-ui components need `"use client"` directive |
| Server Components | Never import base-ui/Radix in Server Components |

### Key File Locations

| File | Purpose |
|---|---|
| `prisma/schema.prisma` | All 17 domain models |
| `prisma.config.ts` | Prisma v7 datasource config (loads .env.local) |
| `src/auth.config.ts` | Edge-safe NextAuth config (used by proxy) |
| `src/proxy.ts` | Route protection (Next.js 16 proxy) |
| `src/lib/auth.ts` | Full NextAuth config (Node.js only) |
| `src/lib/db.ts` | Prisma client with pg adapter |
| `src/lib/game-constants.ts` | All game balance numbers |
| `src/server/services/` | Domain service functions |
| `src/server/game-engine/` | Tick, combat, economy formulas |
| `src/server/queues/index.ts` | All 11 BullMQ queues |
| `src/server/websocket/broadcast.ts` | Redis pub/sub emitter |
| `src/types/socket.ts` | WebSocket event type definitions |
| `src/store/` | Zustand stores |
| `src/components/layout/Providers.tsx` | TanStack Query + Zustand providers |

### Blockers / Warnings
- **Port 5432 blocked by ISP** — always use Supabase MCP for schema changes
- **Redis not running locally** — BullMQ workers + WS server need Redis; dev can run without them (API routes work without Redis)
- **Next.js 16 base-ui rule** — ANY component using `@base-ui/react` must have `"use client"` at the top

---

## Previous Sessions

### Session: 2026-05-12 — M1 + M2 start
- Next.js 16 scaffold, all deps, Prisma v7, Supabase migration (47 tables)
- Auth pages (login, register), game shell (sidebar, topbar), dashboard
- Nation setup flow, seed data (GameWorld + 7 UnitTypes + 13 TechNodes)
- Fixed: middleware→proxy, split NextAuth config, base-ui "use client"
