# AI_RULES.md — NukezoneReborn

> Instructions for future AI coding sessions working on this project.
> Read this before writing any code.

---

## Before Every Session

1. Read `SESSION_HANDOFF.md` — understand current state
2. Read `TODO.md` — find the highest-priority uncompleted task
3. Read `PROJECT_CONTEXT.md` if context is unclear
4. Check `ARCHITECTURE.md` before making structural decisions

## Core Rules

### TypeScript
- **Strict mode always** — `noImplicitAny: true`, `strictNullChecks: true`
- **No `any` types** — use `unknown` and narrow, or define a proper type
- **No type assertions (`as Type`)** unless genuinely unavoidable with a comment explaining why
- All types live in `src/types/` — shared between client and server
- Socket event types in `src/types/socket.ts` — keep in sync with server handlers
- Prisma-generated types are the source of truth for DB models — don't redefine them

### React & Next.js
- **Server Components by default** — do not add `"use client"` unless necessary
- Client components are needed for: browser APIs, event handlers, Zustand, hooks, Framer Motion
- Never call Prisma or server services from a Client Component
- Use Next.js `Server Actions` for form submissions where appropriate
- Never put secrets or server-only code in files without `server-only` import guard
- Route handlers (`route.ts`) are always server-only
- Keep pages thin — extract logic into components and hooks

### Styling
- **Tailwind only** — no inline styles, no CSS Modules, no styled-components
- Use shadcn/ui primitives for all interactive UI (Button, Dialog, Form, etc.)
- Custom game UI builds on top of shadcn/ui — don't reinvent primitives
- Dark theme is the primary/default theme (this is a nuclear war game)
- Color palette: use Tailwind's `slate` as base, `red`/`orange` for danger/attack actions, `green` for safe/allied, `yellow` for warnings

### State Management
- **Zustand for client/UI state** — `src/store/`
- **TanStack Query for server state** — API responses, polling, mutations
- Do not put server state (API data) in Zustand stores
- Do not put UI state (modal open/closed) in TanStack Query
- Zustand stores: one per domain (`useGameStore`, `useUIStore`, `useNotificationStore`)
- Use `immer` middleware for Zustand if deeply nested state updates are needed

### WebSockets
- All WS message types must be defined in `src/types/socket.ts`
- Never dispatch raw WS messages from components — always go through the store
- WS client is a singleton — import from `src/lib/socket.ts`
- Handle reconnection — assume connection can drop at any time
- Distinguish between WS failure and game state: if WS drops, fall back to polling via TanStack Query

### Database & Services
- **All Prisma queries go through service functions** in `src/server/services/`
- Never write `prisma.xxx.findMany()` in a route handler directly — call a service
- Service functions must be typed with Prisma types or explicit return types
- Use Prisma transactions for multi-step game actions (launch: deduct weapon + create MissileFlight atomically)
- Never expose Prisma errors to the client — catch and return safe error messages

### API Routes
- Every route handler must check auth first: `const session = await auth(); if (!session) return 401`
- Validate all inputs with Zod before processing
- Return consistent JSON shape: `{ success: boolean, data?: T, error?: string }`
- Use HTTP status codes correctly — 400 for validation, 401 for unauth, 403 for forbidden, 404 for not found

### Game Engine
- Game engine code lives in `src/server/game-engine/` — pure functions where possible
- No direct DB access from engine functions — pass data in, get results out, let services handle DB
- All game constants (tick interval, damage values, resource rates) in `src/lib/game-constants.ts`
- Never hardcode game balance values in component or service files

### Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Files/folders | kebab-case | `game-engine.ts`, `missile-flight/` |
| React components | PascalCase | `MissileLaunchDialog.tsx` |
| Hooks | camelCase with `use` prefix | `useIncomingAlert.ts` |
| Zustand stores | camelCase with `use` prefix | `useGameStore.ts` |
| Types/interfaces | PascalCase | `MissileFlight`, `NationState` |
| Enums | PascalCase | `MissileStatus.IN_FLIGHT` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_MISSILES_PER_TURN` |
| Server actions | camelCase verb | `launchMissile`, `researchWeapon` |
| API routes | noun, plural, kebab | `/api/game/missile-flights` |

### Forbidden Practices
- ❌ No `any` types
- ❌ No class components
- ❌ No inline styles
- ❌ No Prisma queries in route handlers (use services)
- ❌ No direct WS message dispatch from components
- ❌ No hardcoded game balance values (use game-constants.ts)
- ❌ No `console.log` in production code (use proper logger)
- ❌ No secrets in client-side code or non-server files
- ❌ No skipping Zod validation on API inputs
- ❌ No `useEffect` for data fetching (use TanStack Query)

### Performance
- Prefer Server Components for static/semi-static content (reduces JS bundle)
- Memoize expensive game calculations with `useMemo`
- Virtualize long lists (rankings, game log) with `@tanstack/react-virtual`
- Debounce map interactions
- Lazy load heavy components (map, animations) with `next/dynamic`
- Images via `next/image` only

### Comments
- Only comment **why**, never **what**
- Non-obvious game logic must have a comment explaining the formula or rule
- Mark workarounds: `// WORKAROUND: Socket.io doesn't support X, so we...`
- No JSDoc on obvious functions
- No commented-out code — delete it

---

## Session End Checklist

After any significant work session, update:
- [ ] `TODO.md` — check off completed tasks
- [ ] `SESSION_HANDOFF.md` — add new session block
- [ ] `CHANGELOG.md` — add entry for what was built
