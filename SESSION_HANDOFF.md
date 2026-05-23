# SESSION_HANDOFF.md — NukezoneReborn

> Read this file FIRST at the start of every session.

---

## Session: 2026-05-23 — M3 Polish + Unit Redesign + Exploration

### What Was Done
- **Unit roster redesign**: 18 new named units (Ranger Squad, Spear Team, Ghost Operators, Titan APC, Titan MBT, Storm Artillery, Viper Gunship, Predator Drone Swarm, Strike Jet Squadron, Leviathan Destroyer, Phantom Submarine, Atlas Carrier, Shadow Cell, Stealth Raider Wing + 4 strategic missiles) — seeded via Supabase MCP
- **Category counter multipliers**: AIR +30% vs GROUND, SEA +25% vs AIR, GROUND +15% vs SEA, SPECIAL +20% vs GROUND — applied proportionally to enemy army composition
- **Arsenal counter hints**: each unit card shows "Counters: X" based on slug map
- **Land exploration**: `POST /api/game/explore` — diminishing returns (500 → 10 land, 1 → N turns), `explorationCount` column added to Nation, ExplorePanel on Dashboard
- **Economy tick**: `POST /api/tick/economy` — passive income/upkeep every 30s (called from dashboard)
- **Buildings page**: `/buildings` with BuildingsContent.tsx, connected to `POST /api/buildings`
- **Defense page**: real page with tower/silo/CI stats and improvement guide
- **Settings page**: nation name/color editor + player profile display
- **Mobile sidebar**: hamburger + slide-in drawer

### Current State — What Works End-to-End

```
/ (landing)          ✅ Dark UI, logged-in redirect
/register            ✅ Creates Player + profile
/login               ✅ Credentials auth
/setup               ✅ Create nation (name + color picker)
/dashboard           ✅ Turns bar, morale, resources, ExplorePanel, economy tick
/arsenal             ✅ 18 units in 5 tabs, counter hints, instant training
/research            ✅ Tech tree, live countdown, auto-complete
/military            ✅ Target list, instant attack, battle report inline
/buildings           ✅ 7 building types, build form, land/money cost
/defense             ✅ Tower/silo/CI stats, improvement guide
/settings            ✅ Nation name/color editor
/rankings            ✅ Power score leaderboard
/bank                ✅ Deposit/withdraw, 2% fee, transaction history
/market              ✅ Buy/sell orders (money/land/energy), cancel
/alliances           ✅ Create/join, member roster
/messages            ✅ Inbox + send diplomatic messages
```

### Current Focus
**M4 — Social & Economy Full** (M3 complete except minor label cleanup)

### Immediate Next Actions (priority order)

1. **Label cleanup** (quick — 3 files):
   - `BankContent.tsx:36` — toast says "gold" → "money"
   - `MarketContent.tsx:126` — "Total: X gold" → "money"
   - `research/start/route.ts:48` — "Not enough gold" → "Not enough money"

2. **Battle history page** (`/battles`):
   - List own attacking + defending battles with results
   - Link battle report from military page

3. **Messages — unread badge**:
   - Unread count on sidebar Messages link
   - Battle result notifications in inbox

4. **Espionage UI** (`/intel`):
   - List spy units, status, mission history
   - `POST /api/espionage/launch`

5. **Alliance improvements**:
   - Leave alliance action
   - Treasury contribute/withdraw for members

### Architecture Decisions Locked

| Decision | Choice |
|---|---|
| Combat | Instant, same HTTP response, seeded Mulberry32 RNG |
| Counter system | Category-level multipliers (proportional to enemy composition) |
| Turns | 50 start, +1/5min, max 100, 1 turn per attack |
| Resources | money · land · population · energy |
| Exploration | Diminishing returns: BASE_LAND=500, LAND_DECAY=0.85, MIN=10 |
| Units | 18 named types across 5 categories |
| Buildings | Multiplier-only, consume land, max 10 per type |
| DB access | Always via Supabase MCP for schema changes (port 5432 blocked) |
| Auth | NextAuth v5, `src/auth.config.ts` edge-safe, `src/proxy.ts` |

### Critical Rules for AI Sessions

1. **Server Components** must NEVER import lucide-react, @base-ui/react, framer-motion — only `Link`, `redirect`, `auth()`, Prisma calls
2. **All pages** follow pattern: `page.tsx` (Server, data only) → `PageContent.tsx` (Client, all rendering)
3. **Combat** resolves in `POST /api/military/attack` — no BullMQ, no travel time
4. **Turns** must be synced via `syncTurns(nationId)` before any turn-consuming action
5. **Resource field** is `money` not `gold` everywhere in code
6. **Unit training** is instant — deducts money, adds to army
7. **After `prisma generate`** always restart the dev server (clears Turbopack cache)

### Key File Locations

| File | Purpose |
|---|---|
| `prisma/schema.prisma` | All models |
| `prisma.config.ts` | Prisma v7 config (loads .env.local) |
| `src/auth.config.ts` | Edge-safe NextAuth (used by proxy) |
| `src/proxy.ts` | Route protection |
| `src/lib/game-constants.ts` | All balance numbers (TURNS, ECONOMY, COMBAT, BUILDINGS, EXPLORE, MARKET, BANK) |
| `src/server/game-engine/combat.ts` | Instant battle resolution + category counters |
| `src/server/game-engine/turns.ts` | Turn regen + spend |
| `src/server/game-engine/resources.ts` | Economy tick formulas |
| `src/app/api/military/attack/route.ts` | Main attack endpoint |
| `src/app/api/game/explore/route.ts` | Land exploration (diminishing returns) |
| `src/app/api/buildings/route.ts` | Building construction |
| `src/types/socket.ts` | WebSocket event types |

### Blockers

- **Port 5432 blocked** — all Prisma schema changes must go through Supabase MCP `apply_migration` + `prisma generate` + dev server restart
- **Redis not running locally** — BullMQ workers offline; economy tick via API polling
- **WebSocket server offline** — real-time alerts disabled; app degrades gracefully

---

## Previous Sessions (summary)

| Date | Work |
|---|---|
| 2026-05-09 | Architecture design, all 17 domain docs |
| 2026-05-12 | M1: Next.js 16 scaffold, Prisma v7, Supabase, NextAuth, shadcn/ui |
| 2026-05-13 | M2: Auth pages, dashboard, arsenal, nation setup, seed data |
| 2026-05-14 | M3/M4: Research, rankings, military, bank, market, alliances, messages |
| 2026-05-15 | REDESIGN: Turn-based, instant combat, resource simplification |
| 2026-05-23 | Unit redesign (18 units), category counters, exploration, M3 pages |
