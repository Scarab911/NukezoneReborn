# PROJECT_CONTEXT.md — NukezoneReborn

## Project Overview

**NukezoneReborn** is a full-stack browser-based multiplayer nuclear war strategy game — a modern remake of the classic [Nukezone.nu](https://nukezone.nu). Players manage a nation armed with nuclear weapons, build arsenals, form alliances, launch attacks, defend territory, and compete for global dominance in a persistent real-time world.

## Vision

Recreate the core Nukezone experience with modern web technologies: fast, real-time, mobile-friendly, and scalable. The game should feel immediate and tense, with a clean UI that doesn't distract from strategic decisions. Target: a PWA-first experience playable on desktop and mobile with no installation required.

## Core Gameplay Loop

1. **Nation Setup** — Player creates a nation, chooses a starting region, allocates initial resources
2. **Resource Management** — Earn resources over time (minerals, energy, population), spend on weapons/defenses
3. **Arsenal Building** — Research and produce missile types (conventional, nuclear, ICBM, etc.)
4. **Diplomacy** — Form alliances, sign non-aggression pacts, declare wars
5. **Combat** — Launch missiles at targets, intercept incoming strikes with defense systems
6. **World Events** — Radiation zones, fallout spread, UN sanctions, economic embargoes
7. **Rankings** — Leaderboards by military power, economic strength, survival time, kill count

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15+ (App Router) |
| Language | TypeScript (strict mode) |
| UI Library | React 18+ |
| Styling | Tailwind CSS v4 |
| Component Library | shadcn/ui |
| Client State | Zustand |
| Server State / Cache | TanStack Query (React Query v5) |
| Animations | Framer Motion |
| Real-time | WebSockets (Socket.io or native ws) |
| ORM | Prisma |
| Database | PostgreSQL |
| Auth | NextAuth.js v5 (Auth.js) |
| PWA | next-pwa or custom service worker |
| Testing | Vitest + React Testing Library |
| Linting | ESLint + Prettier |

## Architecture Overview

```
Browser (PWA)
   │
   ├── Next.js 15 App Router (SSR/SSG pages, API Routes)
   │      ├── /app/(auth)/      → Login, Register, OAuth
   │      ├── /app/(game)/      → Dashboard, Map, Arsenal, Diplomacy
   │      ├── /app/api/         → REST endpoints (auth, game actions)
   │      └── /app/admin/       → Admin panel
   │
   ├── Zustand Store             → Client UI state, optimistic updates
   ├── TanStack Query            → Server state sync, caching, polling
   ├── WebSocket Client          → Real-time game events, live map updates
   └── Framer Motion             → Missile launch animations, map transitions
   
Server
   ├── Next.js API Routes        → Auth, CRUD operations
   ├── WebSocket Server          → Real-time event broadcast, game tick
   ├── Game Engine (Node.js)     → Tick processor, damage calc, resource gen
   └── Prisma + PostgreSQL       → Persistent game state
```

## Folder Structure

```
NukezoneReborn/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (auth)/             # Auth route group (login, register)
│   │   ├── (game)/             # Game route group (dashboard, map, arsenal)
│   │   ├── admin/              # Admin panel
│   │   ├── api/                # API route handlers
│   │   ├── layout.tsx          # Root layout
│   │   └── page.tsx            # Landing page
│   ├── components/
│   │   ├── ui/                 # shadcn/ui primitives (auto-generated)
│   │   ├── game/               # Game-specific components (Map, Arsenal, HUD)
│   │   ├── layout/             # Header, Sidebar, Footer
│   │   └── shared/             # Generic reusable components
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Utilities, helpers, constants
│   │   ├── auth.ts             # NextAuth config
│   │   ├── db.ts               # Prisma client singleton
│   │   └── socket.ts           # WebSocket client singleton
│   ├── server/                 # Server-only code
│   │   ├── game-engine/        # Tick processor, combat calculator
│   │   └── websocket/          # WS server handlers
│   ├── store/                  # Zustand stores
│   ├── types/                  # Shared TypeScript types/interfaces
│   └── styles/                 # globals.css, animations
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── migrations/             # DB migration history
├── public/                     # Static assets (icons, sounds, PWA manifest)
├── docs/                       # Additional documentation
└── tests/                      # Test files
```

## Development Philosophy

- **Game-first**: UI/UX decisions serve gameplay clarity, not aesthetics alone
- **Real-time by default**: Assume all critical game state is live and can change at any tick
- **Optimistic UI**: Apply state changes instantly on client, reconcile with server
- **Mobile-first PWA**: Every screen must work on mobile; touch targets, offline capability
- **Modular game engine**: Game logic lives in `/src/server/game-engine/` and is independently testable
- **Type safety everywhere**: No `any` types, strict TypeScript across the entire stack

## Coding Standards

- TypeScript strict mode — no `any`, no implicit `any`
- Functional React components only — no class components
- Server Components by default in App Router; use `"use client"` only when necessary
- All game constants extracted to `/src/lib/constants.ts`
- All Prisma queries go through service functions in `/src/server/services/`
- WebSocket message types defined in `/src/types/socket.ts` (shared client/server)
- Tailwind for all styling — no inline styles, no CSS modules unless unavoidable
- shadcn/ui for all interactive UI primitives

## Current Implementation Status

> See TODO.md for detailed task tracking

- [ ] Project scaffolding (Next.js 15 init, dependencies)
- [ ] Database schema design
- [ ] Authentication system
- [ ] Core game engine (tick, resources)
- [ ] Map system
- [ ] Arsenal / weapons system
- [ ] Combat system
- [ ] Diplomacy system
- [ ] WebSocket real-time layer
- [ ] UI / frontend
- [ ] PWA configuration
- [ ] Admin panel
- [ ] Deployment
