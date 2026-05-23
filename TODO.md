# TODO.md — NukezoneReborn

Last updated: 2026-05-23

---

## Design Decisions — LOCKED

| Decision | Choice | Rationale |
|---|---|---|
| Game model | Turn-based, instant combat | More addictive, simpler to build |
| Map | None — abstract nation list | No territory map, no coordinates |
| Combat | Server-side instant resolution | No BullMQ delay needed for combat |
| Counter system | Category-level multipliers (proportional) | AIR vs GROUND, SEA vs AIR, etc. |
| Resources | Money · Land · Population · Energy only | Removed food/steel |
| Turns | 50 start, +1/5min, max 100 | Limits session length |
| Exploration | Diminishing returns (500→10 land, 1→N turns) | Passive land growth mechanic |
| Units | 18 named types across 5 categories | Redesigned from 30 generic types |
| Buildings | Multiplier-only, consume land | Upgrade path without map complexity |

---

## Milestones

- [x] **M1 — Project Foundation**
- [x] **M2 — Core Game Loop**
- [x] **M3 — Polish & Completeness** (≈done, 3 label fixes outstanding)
- [ ] **M4 — Social & Economy** (espionage UI, alliances full, messages, market improvements)
- [ ] **M5 — Animations & PWA**
- [ ] **M6 — Admin & Deployment**

---

## ✅ COMPLETED

### M1 — Foundation
- [x] Next.js 16 + React 19 scaffold, TypeScript strict
- [x] Prisma v7 with `@prisma/adapter-pg` + `prisma.config.ts`
- [x] Supabase PostgreSQL via transaction pooler (port 6543)
- [x] Supabase MCP configured for all schema changes
- [x] Auth: NextAuth v5, split config (auth.config.ts edge-safe, proxy.ts)
- [x] Redis client, BullMQ queues, Socket.io skeleton

### M2 — Core Game Loop
- [x] Turn system: syncTurns(), spendTurns(), minutesToNextTurn()
- [x] Instant combat engine with seeded Mulberry32 RNG
- [x] Category counter multipliers (AIR/SEA/GROUND/SPECIAL)
- [x] 18 named unit types seeded (5 categories)
- [x] 13 tech nodes seeded (3-layer tree)
- [x] Nation setup flow
- [x] Dashboard: turns bar, morale, resources, ExplorePanel
- [x] Arsenal: category tabs, counter hints, instant training
- [x] Military: target list, instant attack, inline battle report
- [x] Research: tech tree, live countdown, auto-complete
- [x] Rankings: power score leaderboard

### M3 — Polish & Completeness
- [x] Economy tick: passive income + upkeep on 30s poll
- [x] Buildings page: 7 types, build form, land/money cost
- [x] Defense page: tower/silo/CI stats + improvement guide
- [x] Settings page: nation name/color editor
- [x] Mobile sidebar: hamburger + slide-in drawer
- [x] Land exploration: diminishing returns, ExplorePanel on Dashboard

### M4 (partial) — Economy & Social
- [x] Bank: deposit/withdraw, 2% fee, transaction history
- [x] Market: buy/sell orders, cancel
- [x] Alliances: create/join, member roster
- [x] Messages: inbox, send diplomatic messages

---

## 🔜 REMAINING

### Quick Wins — Label/Wording Cleanup
- [ ] `BankContent.tsx:36` — toast says "Deposited X gold" → "money"
- [ ] `MarketContent.tsx:126` — "Total: X gold" → "money"
- [ ] `research/start/route.ts:48` — "Not enough gold" → "Not enough money"

### Battle History Page
- [ ] `/battles` — list own past attacking + defending battles
- [ ] Show outcome, land gained/lost, units lost per battle
- [ ] Link to full battle report

### M4 — Social & Economy Full

#### Messages
- [ ] Unread count badge on sidebar Messages link
- [ ] Battle result auto-notifications in inbox on attack/defend

#### Espionage UI
- [ ] `/intel` page: list spy units, status, mission history
- [ ] Launch spy op: select target + operation type
- [ ] `POST /api/espionage/launch`

#### Alliances Full
- [ ] Leave alliance action
- [ ] Treasury contribute/withdraw for members
- [ ] Alliance war declaration UI

#### Market Improvements
- [ ] Market price history chart (OHLC from PriceHistory table)
- [ ] Market tick: order matching (API auto-called)

---

## 🔜 M5 — Animations & PWA

- [ ] Attack launch animation (flash/shake on Military)
- [ ] Battle result reveal animation (slide-in report card)
- [ ] Resource number tick animation on dashboard
- [ ] `public/manifest.json` — PWA manifest
- [ ] Service worker via `next-pwa`
- [ ] Push notification for incoming attacks
- [ ] Test all pages at 375px

---

## 🔜 M6 — Admin & Deployment

- [ ] `GET /api/health` — health check endpoint
- [ ] `/admin` route group (ADMIN role gated)
- [ ] View all nations, ban players, broadcast events
- [ ] Vercel deployment + env vars
- [ ] `vercel.ts` config for crons (economy tick, bank interest)
- [ ] Deploy WebSocket server + workers to Railway

---

## Technical Debt

- [ ] Rate limiting on all API routes (Upstash ratelimit)
- [ ] Idempotency keys on all mutating routes (`x-idempotency-key` header)
- [ ] BankAccount auto-created on nation setup (currently optional)
- [ ] `goldCost` → `moneyCost` rename in TechNode schema + all references
- [ ] `AllianceTreasury.gold` → `money` field rename in schema
- [ ] Battle history page (listed above)
- [ ] `UnitCategory` index on UnitType for faster queries
- [ ] Enforce money storage cap (`money ≤ land × 500`)
