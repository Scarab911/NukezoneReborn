# ARCHITECTURE.md — NukezoneReborn

## Frontend Architecture

### Next.js 15 App Router

All pages live under `src/app/`. Route groups organize auth vs game vs admin concerns:

```
src/app/
├── (auth)/
│   ├── login/page.tsx
│   └── register/page.tsx
├── (game)/
│   ├── layout.tsx            ← Game shell (sidebar, HUD, notifications)
│   ├── dashboard/page.tsx    ← Nation overview
│   ├── map/page.tsx          ← World map
│   ├── arsenal/page.tsx      ← Weapons management
│   ├── diplomacy/page.tsx    ← Alliances, treaties, wars
│   ├── intel/page.tsx        ← Spy reports, scouting
│   └── rankings/page.tsx     ← Leaderboards
├── admin/
│   └── ...
├── api/
│   └── ...
├── layout.tsx                ← Root layout (providers, fonts)
└── page.tsx                  ← Landing / marketing page
```

**Rule**: Default to Server Components. Add `"use client"` only for:
- Components using browser APIs (WebSocket, localStorage)
- Components with interactive state (forms, animations, real-time updates)
- Zustand store consumers

### State Management Architecture

Two distinct layers — do not mix them:

| Layer | Tool | Scope |
|---|---|---|
| Server state | TanStack Query | API data, game snapshots, nation info |
| Client/UI state | Zustand | Active panel, pending actions, optimistic updates, WS events |

**TanStack Query** handles:
- Nation data polling (fallback if WS drops)
- Leaderboard data
- Alliance info
- Historical logs

**Zustand stores** (`src/store/`):
- `useGameStore` — current game session, live game state from WS
- `useUIStore` — modal state, sidebar open/close, active tab
- `useNotificationStore` — in-game alerts queue

### WebSocket Client Architecture

Single singleton in `src/lib/socket.ts`. All components read from Zustand stores that are populated by the WS listener — no component subscribes directly to raw socket events.

```
WebSocket Server
      │
      ↓  raw events
WS Client (socket.ts)
      │
      ↓  dispatches
Zustand stores
      │
      ↓  reactive reads
React components
```

### Component Organization

```
src/components/
├── ui/               ← shadcn/ui auto-generated (never manually edit)
├── game/
│   ├── Map/          ← World map, territory, explosion overlay
│   ├── Arsenal/      ← Weapons list, launch controls
│   ├── HUD/          ← Resources bar, alerts, health
│   ├── Diplomacy/    ← Alliance panel, treaty modals
│   └── Combat/       ← Launch dialog, incoming alert, detonation fx
├── layout/
│   ├── GameSidebar.tsx
│   ├── TopBar.tsx
│   └── Providers.tsx ← All React context/query providers
└── shared/
    ├── LoadingSpinner.tsx
    ├── ErrorBoundary.tsx
    └── ConfirmDialog.tsx
```

---

## Backend Architecture

### API Routes (Next.js)

REST endpoints under `src/app/api/`. Pattern: `api/[resource]/route.ts`.

```
api/
├── auth/[...nextauth]/route.ts    ← NextAuth handler
├── game/
│   ├── nation/route.ts            ← Get/update own nation
│   ├── launch/route.ts            ← Initiate missile launch
│   ├── research/route.ts          ← Weapon research actions
│   └── diplomacy/route.ts         ← Send proposals, accept/reject
└── admin/
    └── ...
```

All API handlers follow this pattern:
1. Validate session (auth check)
2. Parse and validate request body (Zod)
3. Call service function from `src/server/services/`
4. Return typed JSON response

### Game Engine (`src/server/game-engine/`)

The game tick runs server-side on a timer (Node.js `setInterval` or cron via a standalone process). Never triggered by client requests.

```
game-engine/
├── tick.ts            ← Master tick function (runs every N seconds)
├── resources.ts       ← Resource accumulation per nation per tick
├── combat.ts          ← Missile flight time, intercept probability, damage
├── radiation.ts       ← Fallout spread, contamination zones
├── diplomacy.ts       ← Treaty expiry, war declarations
└── events.ts          ← World events, UN resolutions
```

**Game tick loop:**
1. For each active nation: accumulate resources
2. For each in-flight missile: advance position, check intercept
3. Resolve detonations, apply damage
4. Apply radiation spread
5. Check win/loss conditions
6. Broadcast updated state via WebSocket to affected players
7. Persist snapshot to DB

### WebSocket Server

Runs alongside Next.js (custom server or standalone). Namespaces/rooms per game world.

```
server/websocket/
├── index.ts           ← WS server init, attach to HTTP server
├── handlers.ts        ← Incoming message handlers
└── broadcast.ts       ← Outgoing event helpers
```

**Event types** (defined in `src/types/socket.ts`):
- `game:tick` — full or delta state update
- `missile:launched` — a missile is now in flight
- `missile:intercepted` — interception event
- `missile:detonated` — explosion, damage applied
- `nation:destroyed` — nation eliminated
- `diplomacy:proposal` — alliance/treaty request
- `alert:incoming` — incoming missile detected

### Service Layer (`src/server/services/`)

All database access goes through typed service functions:

```
services/
├── nation.service.ts
├── arsenal.service.ts
├── combat.service.ts
├── diplomacy.service.ts
├── player.service.ts
└── rankings.service.ts
```

---

## Database Design

### Technology: PostgreSQL + Prisma ORM

Schema file: `prisma/schema.prisma`

### Core Entities

```
Player           — User account (links to NextAuth)
Nation           — A player's game entity (name, region, stats)
Resource         — Stored resources per nation (minerals, energy)
Weapon           — Weapon type definitions (missile types, speeds, damage)
Arsenal          — Weapons owned per nation
ResearchProgress — Active weapon research per nation
MissileFlight    — In-flight missile (from, to, ETA, intercepted?)
Alliance         — Alliance between two nations
Treaty           — Specific agreements (NAP, trade, defense)
WorldEvent       — Active world events
RadiationZone    — Contaminated territories
GameLog          — Immutable event history
```

### Key Relationships

```
Player 1──1 Nation
Nation 1──* Arsenal
Nation 1──* ResearchProgress
Nation *──* Alliance (join table)
Nation 1──* MissileFlight (as attacker)
Nation 1──* MissileFlight (as target)
```

---

## Auth Flow

**Provider**: NextAuth.js v5 (Auth.js)

**Supported methods** (planned):
- Email + password (credentials provider)
- Discord OAuth
- Google OAuth

**Flow**:
1. Player registers → creates `Player` record
2. On first login → auto-creates `Nation` record (or guided setup flow)
3. Session JWT contains `playerId` and `nationId`
4. All API routes check session via `auth()` from NextAuth
5. WebSocket auth: token passed in connection handshake, verified server-side

---

## Data Flow (Game Action Example: Launch Missile)

```
User clicks "Launch" button
      ↓
Client optimistic update (Zustand: missile pending)
      ↓
POST /api/game/launch (body: { targetNationId, weaponType })
      ↓
API Route:
  - auth() check
  - Zod validation
  - combatService.initiateLaunch()
      ↓
combatService:
  - Check nation has weapon available
  - Check not blocked by treaty
  - Create MissileFlight record (DB)
  - Broadcast "missile:launched" via WS
      ↓
WS broadcast to target player → alert:incoming
      ↓
Game tick picks up in-flight missile, advances it
```

---

## PWA Architecture

- `public/manifest.json` — App name, icons, theme colors
- `public/sw.js` — Service worker (via next-pwa or custom)
- Offline strategy: Cache shell + API responses; queue game actions while offline
- Install prompt handled in `useInstallPrompt` hook
- Push notifications for: incoming missiles, diplomacy requests, game events

---

## Deployment Strategy

**Target platform**: Vercel (Next.js) + Railway or Fly.io (PostgreSQL + WS server)

```
Vercel
  └── Next.js app (SSR, API routes, static assets)

Railway / Fly.io
  ├── PostgreSQL database
  └── WebSocket server (standalone Node process)
       └── Connects to same DB
       └── Exposes WS endpoint consumed by Next.js frontend
```

**Environment variables** (see ENVIRONMENT_SETUP.md):
- `DATABASE_URL` — Prisma connection string
- `NEXTAUTH_SECRET` — Auth signing secret
- `NEXTAUTH_URL` — Canonical app URL
- `WEBSOCKET_URL` — WS server endpoint (client-side)
- `WEBSOCKET_SECRET` — Internal WS auth token

---

## Scaling Considerations

- **Game worlds**: Partition players into isolated game worlds (each world = independent WS room + scoped DB records) to limit broadcast scope
- **Tick server**: Should be a single process per game world to avoid race conditions; use Redis pub/sub if horizontal scaling becomes necessary
- **DB**: Index heavily on `nationId`, `gameWorldId`, `status` columns for tick queries
- **WebSocket**: Use Socket.io with Redis adapter for multi-instance WS if needed
- **CDN**: All static assets (map tiles, icons, sounds) behind Vercel Edge / CDN
