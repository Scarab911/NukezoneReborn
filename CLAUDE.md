# CLAUDE.md — NukezoneReborn

@AGENTS.md

## Project Context

This is **NukezoneReborn** — a persistent multiplayer nuclear war strategy game (MMO remake of Nukezone.nu).

## Required Reading Before Any Code

Read these files at the start of every session, in order:

1. **`SESSION_HANDOFF.md`** — Current project state, what was last done, what's next
2. **`TODO.md`** — Milestone-organized task list, pick the highest-priority incomplete task
3. **`AI_RULES.md`** — Coding conventions, naming rules, forbidden patterns
4. **`ARCHITECTURE_V2.md`** — Full system architecture (supersedes ARCHITECTURE.md)

## Quick Reference

- **Stack**: Next.js 16, React 19, TypeScript strict, Tailwind v4, shadcn/ui, Zustand, TanStack Query, Socket.io, BullMQ, Redis, PostgreSQL, Prisma, NextAuth v5
- **Domain docs**: `docs/` folder — DOMAIN_MODULES, TICK_SYSTEM, BATTLE_ENGINE, ECONOMY_ENGINE, ESPIONAGE_ENGINE, REALTIME_ARCHITECTURE, DATABASE_SCALING, ANTI_CHEAT, DEVOPS
- **Core rule**: Server authoritative always. Client is a display terminal. Economy mutations in `prisma.$transaction`. Async ops via BullMQ, never setTimeout.

## Key Constraints

- `"use client"` only when required (browser APIs, event handlers, Zustand consumers, Framer Motion)
- No `any` types — ever
- No Prisma queries in route handlers — use service functions in `src/server/services/`
- All API routes: auth check → rate limit → Zod validation → service call
- All state-mutating actions carry an idempotency key (`x-idempotency-key` header)
