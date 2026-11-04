# SESSION_HANDOFF.md — NukezoneReborn

> Read this file FIRST at the start of every session.

---

## Session: 2026-11-04 — In-App Test + Battle Casualties

### What Was Done
- **Tested in the running app** with 3 accounts (logins in a local scratchpad file, not in the repo): register/setup/rename, attack range (UI + API), land floor, ruin shield, attacking ends own shield, abandon → alliance handover → setup → reuse old name. All pass
- **Fixed** missing "In range" filter button on the military page (`1a9165e`)
- **Battle casualties**: `applyCasualties` in `combat.ts` removes losses inside the battle transaction, re-reading stacks so concurrent battles can't go negative; `distributeLosses` splits proportionally (largest remainder). `Nation.totalUnits` is set from the real remaining count, which also repairs drifted counters. Transaction timeout raised to 15s
- Verified live: 70 Spear + 30 Ranger losing 10 → 63 + 27; defender 10 → 7 (its stale `totalUnits` of 300 corrected to 7)

### Test Data (kept on purpose)
- Enclaves `QA Alpha Prime`, `QA Bravo`, `QA Charlie`; alliance `QA Pact` (Charlie leads). Their stats were set by SQL for testing; they're not natural game states

### Notes
- Stopping the dev server via the background task can leave `next start-server` alive on port 3000 — kill the node process tree if a restart fails with 500s
- Not tested yet: lazy expiry of the 72h new-player shield

---

## Session: 2026-11-03 (later) — Attack Range + Ruin Shield

### What Was Done
- **Networth + attack range** (`src/lib/networth.ts`): `calcNetworth`, `attackRange`, `rangeStatus`, `landTakenOnWin`. Range is `myNW × 0.5 ≤ targetNW ≤ myNW ÷ 0.5` — always mutual. Dashboard, military and rankings now use the shared formula (rankings still adds battles × 50 to its score)
- **Attack route**: range check (403), destroyed targets rejected; the attacker-protection check now runs last, so a rejected attack never costs the attacker's shield
- **Ruin, not destruction** (`combat.ts`): land taken = 5% but never below `COMBAT.LAND_FLOOR` (100). If the defender ends at the floor, `grantRuinShield` sets PROTECTED for 24h (`COMBAT.RUIN_SHIELD_HOURS`); defender notification payload carries `shieldUntil`
- **`protection.service.ts`**: protection based on `Nation.protectedUntil` (new column); founding sets now + 72h
- **Military UI**: "Your range: X – Y"; out-of-range targets dimmed with "Too weak"/"Too strong", attack disabled; "In range" filter is the default
- **Abandon enclave**: Settings → type the name to confirm → `abandonEnclave()` (leaves alliance — leadership passes to an officer or longest-serving member; empty alliance disbanded) → DESTROYED → `/setup`
- **DB migration (Supabase MCP)**: `Nation.protectedUntil TIMESTAMP(3)` nullable, backfilled for PROTECTED rows

### Not Yet Verified
- Type-check, lint and a range-maths check (symmetry, bounds, land floor) pass. **Not exercised in the running app** — needs 2–3 test accounts

### Open Issues Found
- **Battles never remove lost units** — `attackerLost`/`defenderLost` are only written to the report; `ArmyUnit.quantity` and `Nation.totalUnits` stay unchanged. Networth therefore never drops from losing units; only land changes
- An enclave that never grows past 100 land gets a fresh 24h shield after every lost battle (shield farming) — watch for it
- Buildings aren't removed when land is lost

---

## Session: 2026-11-03 — Enclave Identity

### What Was Done
- **"Nation" → "Enclave" in all player-facing text** (UI copy + API error messages). Internal code, Prisma `Nation` model, routes (`/api/game/nation`) and `nation.service.ts` intentionally keep "nation" (`de4fa24`)
- **Landing page "enclaves founded" counter** — `countNationsFounded()` (`de4fa24`)
- **Identity model reworked** (`11baa25`):
  - Registration = email + password only. Display name removed from form/API; no `UserProfile` created on register (`Player.name` / `UserProfile` now unused)
  - `/setup` = enclave name only; color assigned at random from `ENCLAVE.COLORS`. `/setup` is now a server page (redirects players with a living enclave to `/dashboard`) + client `SetupForm.tsx`
  - Settings: display name + color picker removed; enclave name can be changed **once** (`Nation.nameChangesLeft`, default 1)
  - Restart after destruction: game layout redirects `DESTROYED` enclaves to `/setup` ("Rise From the Ashes"); founding detaches the old record (`playerId → null`, `formerPlayerId` kept) so battle history survives
  - Enclave names unique **case-insensitively among living enclaves**; destroyed enclaves' names are reusable
  - Founding/renaming logic moved to `nation.service.ts` (`foundEnclave`, `renameEnclave`, `hasLivingEnclave`, `getDestroyedEnclaveName`)
- **DB migration (Supabase MCP)**: `Nation.playerId` nullable; added `formerPlayerId TEXT` (indexed) and `nameChangesLeft INT NOT NULL DEFAULT 1`
- **DB reset**: all player/game tables truncated. Seed kept: 1 GameWorld, 18 UnitType, 13 TechNode. Register a fresh account to test

### Design Decisions (from the owner)
- One world (server), one enclave per player. Players are known **only by their enclave name** — no separate player/commander name
- Destroyed enclave → player starts from scratch with a new name
- Renames: once for now → later once per round/season; VIP subscribers get extra renames (top up `nameChangesLeft`)

### Not Yet Verified
- New flows were type-checked and linted but **not exercised in the running app** (dev server was stopped by low system memory). First thing next session: register → setup → rename once → confirm second rename is blocked

### Open Issues Found
- **Nothing ever sets `status = DESTROYED`** — the destruction mechanic doesn't exist yet, so the restart flow is dormant. When building it, also: remove the enclave from its alliance, hide destroyed enclaves from rankings/target/message lists, and block all mutating API routes for destroyed enclaves (today only explore + attack check)
- `Player.name` and `UserProfile` are now dead data — decide whether to drop them

---

## Session: 2026-10-30 — Migration to New PC + Audit

### What Was Done
- Project transferred to a new PC; repo verified in sync with `origin/master`
- `npm ci` on Node 24 / npm 12 — npm 12 blocks install scripts by default, so `allowScripts` was added to `package.json` (prisma, @prisma/engines, esbuild, sharp, unrs-resolver)
- `prisma generate` run; DB schema verified to match `schema.prisma` (no drift)
- Supabase project had been auto-paused (free tier inactivity) — restored; data intact
- `.env.local` recreated (gitignored — not transferred). Auth secrets regenerated; `DATABASE_URL` password and Discord OAuth creds must be filled in manually
- Lint fixed: 0 errors, 0 warnings (`useState(() => Date.now())`, unescaped `'`, unused imports)

### Open Issues Found
- **RLS disabled on all 45 public tables** — exposed to Supabase anon key. App uses Prisma (bypasses RLS), so enabling RLS with no policies is safe for the app but not yet applied
- Dependencies have minor updates available (Prisma 7.8 → 7.10, etc.) and `npm audit` reports vulnerabilities — not upgraded yet

---

## Work Since 2026-05-23 (commits after last handoff)
- **Military target intel**: land, power score, difficulty label; sort/filter/search; sticky attack panel with potential land gain (`c6527f2`)
- **Label cleanup done**: gold → money in bank, market, research (`c6527f2`)
- **Enemy unit count hidden** — spies-only intel; `totalUnits` used server-side only (`e056206`)
- **Economy tick fix**: morale row upsert, try-catch, silent client errors (`9f0657e`)
- **72h new-player protection**: lazily expires; attacking while protected requires `acknowledgeProtectionLoss=true` and strips protection; two-step confirm UI (`5963782`)
- **Dashboard** shows power score instead of population (`4c8c110`)
- **Population removed entirely** — schema, constants, tick, combat, HUD; income is land-based (`bdab2d6`)

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
/register            ✅ Email + password only
/login               ✅ Credentials auth
/setup               ✅ Found enclave (name only, random color); restart after destruction
/dashboard           ✅ Turns bar, morale, resources, ExplorePanel, economy tick
/arsenal             ✅ 18 units in 5 tabs, counter hints, instant training
/research            ✅ Tech tree, live countdown, auto-complete
/military            ✅ Target list, instant attack, battle report inline, networth range (50%–200%)
/buildings           ✅ 7 building types, build form, land/money cost
/defense             ✅ Tower/silo/CI stats, improvement guide
/settings            ✅ One-time enclave rename, abandon enclave
/rankings            ✅ Power score leaderboard
/bank                ✅ Deposit/withdraw, 2% fee, transaction history
/market              ✅ Buy/sell orders (money/land/energy), cancel
/alliances           ✅ Create/join, member roster
/messages            ✅ Inbox + send diplomatic messages
```

### Current Focus
**M4 — Social & Economy Full** (M3 complete)

### Immediate Next Actions (priority order)

0. **Verify enclave identity flows** in the running app (see 2026-11-03 "Not Yet Verified")

1. **Security**: decide on enabling RLS for all public tables (see Open Issues above)

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
| Resources | money · land · energy (population removed 2026-05-24) |
| Protection | 72h for new nations; lost on attacking |
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
