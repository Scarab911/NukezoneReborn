# SESSION_HANDOFF.md — NukezoneReborn

> Read this file FIRST at the start of every session.

---

## Session: 2026-05-15 — Major Redesign (Turn-Based + Instant Combat)

### What Was Done
- Completely redesigned game model per new spec
- Prisma schema rewritten: removed HP, territory, ArmyMovement; added turns, Building, UnitCategory
- DB migration applied via Supabase MCP (port 5432 still blocked by ISP)
- 30 unit types seeded (Ground/Air/Sea/Special/Strategic) + 13 TechNodes
- New engine files: `combat.ts` (instant seeded-RNG resolver), `turns.ts` (regen system)
- Updated all pages and API routes for new resource model (gold→money, removed food/steel)
- Deleted old `/api/military/launch`, added `/api/military/attack` (instant)
- Added `/api/buildings` route
- Updated TODO.md, SESSION_HANDOFF.md, AI_RULES.md comprehensively

### Current State — What Works End-to-End

```
/ (landing)          ✅ Dark UI, logged-in redirect
/register            ✅ Creates Player + profile
/login               ✅ Credentials auth
/setup               ✅ Create nation (name + color picker)
/dashboard           ✅ Turns bar, morale, money/land/pop/energy
/arsenal             ✅ 30 units in 5 tabs, instant training (deducts money)
/research            ✅ Tech tree, live countdown, auto-complete
/military            ✅ Target list, instant attack, battle report shown inline
/rankings            ✅ Power score leaderboard
/bank                ✅ Deposit/withdraw, 2% fee, transaction history
/market              ✅ Buy/sell orders (money/land/energy)
/alliances           ✅ Create/join, member roster
/messages            ✅ Inbox + send diplomatic messages
```

### Current Focus
**M3 — Polish & Completeness**

### Immediate Next Actions (priority order)

1. **Economy tick** — wire up passive income on dashboard load (like research auto-complete):
   ```
   POST /api/tick/economy → calculates income since last tick → updates money + morale
   ```

2. **Buildings page** — `/buildings` with `BuildingsContent.tsx`:
   - Show 7 building types, current count, cost (money + land), effect
   - Connect to existing `POST /api/buildings`

3. **Fix 404 sidebar links**:
   - `/defense` → simple stub page
   - `/settings` → simple stub page

4. **Label fixes**:
   - Research "goldCost" displayed as "money" in UI
   - Bank toast "gold" → "money"

5. **Mobile sidebar** — hamburger menu on mobile (currently hidden)

### Architecture Decisions Locked

| Decision | Choice |
|---|---|
| Combat | Instant, same HTTP response, seeded Mulberry32 RNG |
| Turns | 50 start, +1/5min, max 100, 1 turn per attack |
| Resources | money · land · population · energy |
| Income | land × 10 × moraleMultiplier (per economy tick) |
| Units | 30 types, category tabs, instant training |
| Buildings | Multiplier-only, consume land, max 10 per type |
| DB access | Always via Supabase MCP for schema changes (port 5432 blocked) |
| Auth | NextAuth v5, `src/auth.config.ts` edge-safe, `src/proxy.ts` |

### Critical Rules for AI Sessions

1. **Server Components** must NEVER import lucide-react, @base-ui/react, framer-motion, or any module using createContext. Only `Link`, `redirect`, `auth()`, Prisma calls.
2. **All pages** follow the pattern: `page.tsx` (Server, data only) → `PageContent.tsx` (Client, all rendering)
3. **Combat** resolves in `POST /api/military/attack` — no BullMQ, no travel time
4. **Turns** must be synced via `syncTurns(nationId)` before any turn-consuming action
5. **Resource field** is `money` not `gold` everywhere in code
6. **Unit training** is instant (no training queue timer) — just deducts money, adds to army

### Key File Locations

| File | Purpose |
|---|---|
| `prisma/schema.prisma` | All models — redesigned |
| `prisma.config.ts` | Prisma v7 config (loads .env.local) |
| `src/auth.config.ts` | Edge-safe NextAuth (used by proxy) |
| `src/proxy.ts` | Route protection |
| `src/lib/game-constants.ts` | All balance numbers |
| `src/server/game-engine/combat.ts` | Instant battle resolution |
| `src/server/game-engine/turns.ts` | Turn regen + spend |
| `src/server/game-engine/resources.ts` | Economy tick formulas |
| `src/app/api/military/attack/route.ts` | Main attack endpoint |
| `src/app/api/buildings/route.ts` | Building construction |
| `src/types/socket.ts` | WebSocket event types |
| `src/store/useGameStore.ts` | Zustand live state |
| `src/store/useUIStore.ts` | Zustand UI + alerts |

### Blockers

- **Port 5432 blocked** — all Prisma schema changes must go through Supabase MCP `apply_migration`
- **Redis not running locally** — BullMQ workers offline; economy tick needs manual trigger or API-based polling
- **WebSocket server offline** — real-time alerts disabled; app degrades gracefully

---

## Previous Sessions (summary)

| Date | Work |
|---|---|
| 2026-05-09 | Architecture design, all 17 domain docs |
| 2026-05-12 | M1: Next.js 16 scaffold, Prisma v7, Supabase migration, NextAuth, shadcn/ui |
| 2026-05-13 | M2: Auth pages, dashboard, arsenal, nation setup, seed data |
| 2026-05-14 | M3/M4: Research, rankings, military, bank, market, alliances, messages |
| 2026-05-15 | REDESIGN: Turn-based, instant combat, 30 unit types, resource simplification |
