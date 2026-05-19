# TODO.md — NukezoneReborn

Last updated: 2026-05-15 (post-redesign)

---

## Design Decisions — LOCKED

| Decision | Choice | Rationale |
|---|---|---|
| Game model | Turn-based, instant combat | More addictive, simpler to build, no travel-time complexity |
| Map | None — abstract nation list | No territory map, no coordinates |
| Combat | Server-side instant resolution (same HTTP response) | No BullMQ delay needed for combat |
| Resources | Money · Land · Population · Energy only | Removed food/steel — fake complexity without fun |
| Turns | 50 start, +1/5min, max 100 | Limits session length, creates natural pacing |
| Ticks | Economy tick every 30s (money accumulation) | Still needed for passive income; BullMQ or cron |
| Units | 30 types across Ground/Air/Sea/Special/Strategic | Deep-feeling variety, all map to atk/def numbers |
| Buildings | Multiplier-only, consume land | Upgrade path without map complexity |

---

## Milestones

- [x] **M1 — Project Foundation**
- [x] **M2 — Core Game Loop** (redesigned)
- [ ] **M3 — Polish & Completeness** (buildings UI, economy tick, remaining pages)
- [ ] **M4 — Social & Economy** (espionage UI, alliances full, messages, market tick)
- [ ] **M5 — Animations & PWA** (Framer Motion, manifest, push notifications)
- [ ] **M6 — Admin & Deployment** (admin panel, Vercel deploy, monitoring)

---

## ✅ COMPLETED

### M1 — Foundation
- [x] Next.js 16 + React 19 scaffold, TypeScript strict
- [x] All deps: bullmq, ioredis, socket.io, prisma, next-auth, zod, pino, shadcn/ui
- [x] Prisma v7 with `@prisma/adapter-pg` + `prisma.config.ts`
- [x] Supabase PostgreSQL connected via transaction pooler (port 6543)
- [x] Supabase MCP configured for schema changes
- [x] Auth: NextAuth v5, split config (auth.config.ts for edge proxy)
- [x] `src/proxy.ts` — route protection (Next.js 16 proxy)
- [x] Redis client, BullMQ queues, logger, distributed lock
- [x] WebSocket server skeleton + Redis pub/sub broadcast
- [x] shadcn/ui initialized

### M2 — Core Game Loop (post-redesign)
- [x] **Turn system**: syncTurns(), spendTurns(), minutesToNextTurn()
- [x] **Instant combat engine**: resolveInstant() with seeded Mulberry32 RNG
- [x] **Prisma schema redesign**: turns, money/land/population, Building model
- [x] **30 unit types seeded**: Ground/Air/Sea/Special/Strategic
- [x] **13 tech nodes seeded**: 3-layer tree (base→mid→advanced)
- [x] **Nation setup flow**: /setup → POST /api/game/nation
- [x] **Dashboard**: turns bar, morale, resources, battle count
- [x] **Arsenal**: category tabs, train instantly (deducts money)
- [x] **Military**: target list, instant attack with battle report
- [x] **Research**: tech tree with live timer, auto-complete on page load
- [x] **Rankings**: power score leaderboard (units×10 + land×5 + battles×50)

### M4 (partial) — Economy & Social
- [x] **Bank**: deposit/withdraw (2% fee), transaction history
- [x] **Market**: buy/sell orders (3 resource types), order book, cancel
- [x] **Alliances**: create/join, member roster, treasury display
- [x] **Messages**: inbox (all notification types), send diplomatic messages

---

## 🔜 M3 — Polish & Completeness

### Buildings Page
- [ ] `/buildings` page with `BuildingsContent.tsx` (client component)
- [ ] Show all 7 building types with current count, cost, effect description
- [ ] Build form (count input, turn cost display, land requirement warning)
- [ ] Connect to existing `POST /api/buildings` route

### Economy Tick (passive income)
- [ ] API route: `POST /api/tick/economy` — process income for calling nation
- [ ] Call on dashboard load (like research auto-complete pattern)
- [ ] Formula: `money += land × 10 × moraleMultiplier` per tick
- [ ] Upkeep: deduct `totalUnits × 0.1` per tick
- [ ] Add to BullMQ economy tick worker when Redis available

### Missing Pages (stubs needed)
- [ ] `/settings` — display name change, color picker, delete nation
- [ ] `/defense` — view defense towers, CI rating, active spy ops against you
- [ ] `/intel` — spy reports, sent thief operations

### Remaining Fixes
- [ ] Sidebar "Defense" link points to `/defense` (currently 404)
- [ ] Sidebar "Settings" link points to `/settings` (currently 404)
- [ ] Register → setup → dashboard flow: confirm no errors end-to-end
- [ ] Research page: show gold cost as "money cost" (label rename)

---

## 🔜 M4 — Social & Economy Full

### Espionage UI
- [ ] `/intel` page: list of spy units, status, mission history
- [ ] Launch spy op: select target + operation type
- [ ] Show spy reports with estimated data (±15% noise already in engine)
- [ ] `POST /api/espionage/launch` — initiate spy operation (async resolve)

### Alliances Full
- [ ] Leave alliance action
- [ ] Alliance treasury: contribute/withdraw for members
- [ ] Alliance war declaration UI
- [ ] Treaty proposals between alliances

### Market Improvements
- [ ] Market price history chart (OHLC candles from PriceHistory table)
- [ ] Market tick: run order matching every 5 min (API route auto-called)

### Messages
- [ ] Real notifications for battle results (currently only diplomatic messages show)
- [ ] Unread count badge on sidebar Messages link

---

## 🔜 M5 — Animations & PWA

### Framer Motion
- [ ] Attack launch animation (flash/shake on Military page)
- [ ] Battle result reveal animation (slide in report card)
- [ ] Turn counter pulse when turns regenerate
- [ ] Resource number tick animation on dashboard

### PWA
- [ ] `public/manifest.json` (name, icons, display: standalone, theme: #0f172a)
- [ ] Service worker via `next-pwa`
- [ ] Offline fallback page
- [ ] Push notification for incoming attacks (Web Push API)
- [ ] Install prompt component

### Mobile Polish
- [ ] Test all pages at 375px
- [ ] Swipeable mobile sidebar (currently hidden on mobile — show hamburger menu)
- [ ] Touch-friendly attack/train buttons (min 44px)

---

## 🔜 M6 — Admin & Deployment

### Admin Panel
- [ ] `/admin` route group gated to ADMIN role
- [ ] View all nations, force-status-change, ban players
- [ ] Broadcast world event manually
- [ ] View GameLog stream
- [ ] Economy anomaly alerts

### Deployment
- [ ] `npm i -g vercel` + `vercel` login
- [ ] Connect GitHub repo to Vercel project
- [ ] Set all env vars in Vercel dashboard
- [ ] Supabase pooler URL as DATABASE_URL
- [ ] Deploy WebSocket server + workers to Railway
- [ ] Health check endpoint: `GET /api/health`
- [ ] `vercel.ts` config for crons (economy tick, bank interest)

---

## Technical Debt

- [ ] Rate limiting on all API routes (Upstash ratelimit)
- [ ] Idempotency middleware on all mutating routes
- [ ] Research: rename "goldCost" → "moneyCost" in TechNode schema
- [ ] Add `UnitCategory` index to UnitType for faster category queries
- [ ] BankAccount auto-created on nation setup (currently optional)
- [ ] Enforce land storage cap (`money ≤ land × 500`)
- [ ] Battle history page: list own past battles with reports

---

## Known Issues

- [ ] `src/app/(game)/bank/BankContent.tsx` — `act("deposit")` toast says "gold" (label fix)
- [ ] Research page labels say "gold" for cost (should say "money")
- [ ] No economy tick running locally (passive income doesn't accumulate without Redis)
- [ ] WebSocket server not running in dev (graceful degradation active, no real-time)
- [ ] Defense and Settings sidebar links return 404
