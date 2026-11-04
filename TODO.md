# TODO.md — NukezoneReborn

Last updated: 2026-11-04

---

## Design Decisions — LOCKED

| Decision | Choice | Rationale |
|---|---|---|
| Game model | Turn-based, instant combat | More addictive, simpler to build |
| Map | None — abstract nation list | No territory map, no coordinates |
| Combat | Server-side instant resolution | No BullMQ delay needed for combat |
| Counter system | Category-level multipliers (proportional) | AIR vs GROUND, SEA vs AIR, etc. |
| Resources | Money · Land · Energy only | Removed food/steel/population |
| Turns | 50 start, +1/5min, max 100 | Limits session length |
| Exploration | Diminishing returns (500→10 land, 1→N turns) | Passive land growth mechanic |
| Units | 18 named types across 5 categories | Redesigned from 30 generic types |
| Buildings | House the army (Barracks, War Factory, Airfield, Shipyard, Missile Silo); consume land; no per-type cap. Defense Towers keep +8% defense | Army size tied to land; razing hurts (2026-11-04) |
| Housing overflow | Razed housing → 24h to rebuild, then the excess deserts proportionally; training blocked meanwhile | Not instant punishment, not toothless |
| Player identity | Enclave name only (no player/display name) | One world, one enclave per player |
| Terminology | "Enclave" in UI; `Nation` stays in code/DB | Post-apocalyptic fit without a risky rename |
| Destruction | Combat ruins, never destroys: land floor 100 + 24h ruin shield. Restart only via "Abandon enclave" | Keeps beaten players in the game; old record kept (`formerPlayerId`) |
| Attack range | Networth 50%–200% of yours, mutual (`src/lib/networth.ts`) | Big can't farm small; beaten players drop out of big players' range |
| Renames | Once per enclave → once per round later; VIPs get extra | Stored as `Nation.nameChangesLeft` |

---

## Milestones

- [x] **M1 — Project Foundation**
- [x] **M2 — Core Game Loop**
- [x] **M3 — Polish & Completeness** - [ ] **M4 — Social & Economy** (espionage UI, alliances full, messages, market improvements)
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
- [x] Settings page: nation name/color editor (2026-11-03: now one-time enclave rename only)
- [x] Mobile sidebar: hamburger + slide-in drawer
- [x] Land exploration: diminishing returns, ExplorePanel on Dashboard

### M4 (partial) — Economy & Social
- [x] Bank: deposit/withdraw, 2% fee, transaction history
- [x] Market: buy/sell orders, cancel
- [x] Alliances: create/join, member roster
- [x] Messages: inbox, send diplomatic messages

---

## 🔜 REMAINING

### Enclave Identity (follow-ups)
- [x] Verify in running app: register → setup → rename once → second rename blocked (2026-11-04)
- [x] Networth attack range 50%–200%, checked server-side; military page shows range, greys out-of-range targets
- [x] Ruin instead of destruction: land floor 100, 24h ruin shield, `Nation.protectedUntil`
- [x] Abandon enclave (Settings) → DESTROYED → `/setup`; leaves alliance (leader handed over / alliance disbanded)
- [x] Verify in running app with 3 accounts: range (UI + API), land floor, ruin shield, attacking ends own shield, abandon → alliance handover → setup → new enclave (2026-11-04)
- [ ] Setup screen says "was destroyed" after a voluntary abandon — reword
- [ ] Hydration warning: header money formatted with server locale ("5 000") vs browser ("5,000") — use a fixed locale
- [x] Battles remove lost units — split proportionally across unit types; `Nation.totalUnits` re-synced from real armies (2026-11-04)
- [ ] Test lazy expiry of the 72h new-player shield (set `protectedUntil` in the past, then attack)
- [x] Attacks raze buildings: land taken comes from free and built land proportionally; razed buildings free their land for the attacker (2026-11-04)
- [x] Army housing: units take space in housing buildings; Barracks added; attack bonuses removed; 24h overflow deadline → proportional desertion (2026-11-04)
- [x] Building service: one atomic transaction (turns + money + land guarded), turn errors returned as 400, destroyed enclaves rejected (2026-11-04)
- [ ] Verify housing in running app (dev server must be restarted to load the new Prisma client): train to cap → rejected; raze barracks → banner + deadline; rebuild clears; past deadline → desertion
- [ ] Research Lab / Power Plant have no effect yet (labelled on the page) — implement or remove
- [ ] Economy tick uses `Resource.updatedAt` as its clock, so any resource write (build, explore, battle) resets accrued income — add a dedicated `lastTickAt`
- [ ] Explore's 10,000 land cap checks free land only, so building lets total land exceed it; battle land gains ignore the cap
- [ ] Income counts free land only, so each building costs 50 money/tick in lost income — decide if intended
- [ ] Attack route: `spendTurns` throw is uncaught (500 on a race)
- [ ] Dashboard/settings "Land" still shows free land only — consider showing total (free + built)
- [ ] Watch for shield farming (staying at 100 land to be shielded after each loss); add a cooldown if needed
- [ ] Hide destroyed enclaves from message recipients
- [ ] Block all mutating API routes for destroyed enclaves (only explore + attack check today)
- [ ] Decide: drop unused `Player.name` / `UserProfile` (no longer written on register)
- [ ] Future: reset `nameChangesLeft` per round/season; extra renames for VIP subscribers
- [ ] Optional: DB-level unique index on living enclave names (currently app-level check only)

### Security
- [ ] Enable RLS on all 45 public tables (currently exposed to Supabase anon key; Prisma bypasses RLS)

### Maintenance
- [ ] Minor dependency upgrades (Prisma 7.10, base-ui, TanStack Query) + `npm audit fix`

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
