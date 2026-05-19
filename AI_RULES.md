# AI_RULES.md — NukezoneReborn

> Read this before writing any code. These rules are non-negotiable.

---

## Session Start Checklist

1. Read `SESSION_HANDOFF.md` — current state, what's broken, what's next
2. Read `TODO.md` — pick highest-priority uncompleted task
3. Check `AI_RULES.md` (this file) for patterns and forbidden practices

---

## Next.js 16 Rules (CRITICAL)

### The Server/Client Split Rule

**Server Component files (`page.tsx` without `"use client"`) MUST NEVER import:**
- `lucide-react` — uses `createContext` internally in v1
- `@base-ui/react/*` — uses `createContext`
- `framer-motion` — uses `createContext`
- Any component using React hooks or browser APIs

**The pattern for every new page:**
```
src/app/(game)/mypage/
├── page.tsx          ← Server only: auth() + Prisma + pass plain props
└── MyPageContent.tsx ← "use client": all UI with lucide/base-ui/framer
```

**All base-ui components need `"use client"` at the top:**
```typescript
"use client";
import { Button as ButtonPrimitive } from "@base-ui/react/button"
```

### Other Next.js 16 Rules
- `src/proxy.ts` replaces `middleware.ts`
- Auth split: `src/auth.config.ts` (edge-safe) + `src/lib/auth.ts` (full)
- No Prisma/bcrypt in proxy — edge runtime only

---

## TypeScript Rules

- **No `any` types** — use `unknown` + narrow
- Prisma-generated types are source of truth — never redefine DB models
- All API route bodies: validate with Zod `.safeParse()` before use
- Socket event types live in `src/types/socket.ts`
- `z.string().cuid()` only for Prisma-generated IDs. Use `z.string().min(1)` for seeded IDs (UUIDs, plain strings)

---

## Game Architecture Rules

### Resource Model
```
Field:     money       land       population    energy
Removed:   food, steel, hp, maxHp, coordX, coordY
```
Always `money` not `gold`. TechNode schema still has `goldCost` column (display as "money").

### Combat — Instant, No BullMQ
- `POST /api/military/attack` → resolves synchronously → result in same HTTP response
- Engine: `src/server/game-engine/combat.ts` → `resolveInstant()`
- Never add travel time or delayed jobs to combat
- RNG: seeded Mulberry32 (stored as `battle.seed` for replays)

### Turns
- Every action call `spendTurns(nationId, cost)` from `src/server/game-engine/turns.ts`
- Always call `syncTurns(nationId)` before checking turns (calculates regen)
- Costs: attack=1, build=2/building, research=0

### Unit Training — Instant
- Deducts money immediately, adds to army immediately
- No training queue timer
- Route: `POST /api/military/train` upserts Unit row

### Services Layer
- No Prisma queries in route handlers — use `src/server/services/`
- `resource.service.ts` uses `money` field

### API Routes Pattern
```typescript
1. auth() check → 401
2. Zod validation
3. Fetch nation by playerId (never trust client-sent nationId)
4. Business validation (money, turns, etc.)
5. prisma.$transaction for multi-step mutations
6. Return typed JSON
```

---

## Naming

| Thing | Convention |
|---|---|
| Resource "gold" | Always `money` in code |
| Page files | `page.tsx` (server) + `XyzContent.tsx` (client) |
| API routes | Verb-based: `/api/military/attack`, `/api/buildings` |
| Services | `[domain].service.ts` |
| Engine | `[domain].ts` in `src/server/game-engine/` |
| Stores | `use[Domain]Store.ts` |

---

## Forbidden

- ❌ No HP system (removed)
- ❌ No territory map / coordinates (removed)
- ❌ No BullMQ delayed combat (combat is instant)
- ❌ No `any` types
- ❌ No Prisma in route handlers (use services)
- ❌ No lucide-react in Server Components
- ❌ No `middleware.ts` (use `proxy.ts`)
- ❌ No `z.string().cuid()` for raw-SQL-seeded IDs
- ❌ No port 5432 connections locally (ISP blocks it — use Supabase MCP)

---

## Supabase MCP

Port 5432 blocked locally. All schema changes via MCP:
```
apply_migration  → DDL (ALTER TABLE, CREATE TABLE)
execute_sql      → DML (INSERT, UPDATE, SELECT)
```
After schema change: `npx prisma generate` locally, then apply SQL via MCP.
**Never run `npx prisma migrate dev`** — it will fail.

---

## Session End Checklist

- [ ] `TODO.md` — check off done tasks, add discovered work
- [ ] `SESSION_HANDOFF.md` — add new session block at top
- [ ] `CHANGELOG.md` — add entry
- [ ] Commit + push feature branch
- [ ] If milestone complete: merge to master
