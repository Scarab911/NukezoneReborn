# ENVIRONMENT_SETUP.md — NukezoneReborn

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20+ LTS | Use nvm or fnm to manage versions |
| npm | 10+ | Comes with Node 20 |
| PostgreSQL | 15+ | Local or Docker |
| Git | Any recent | Already initialized |

---

## Initial Project Scaffolding

> Run these commands once when setting up the project from scratch.

### 1. Create Next.js App

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

When prompted:
- Would you like to use Turbopack? → **Yes**
- Use `src/` directory? → **Yes**
- Use App Router? → **Yes**

### 2. Install Core Dependencies

```bash
# State management & data fetching
npm install @tanstack/react-query @tanstack/react-query-devtools
npm install zustand immer

# Animations
npm install framer-motion

# WebSockets
npm install socket.io socket.io-client

# Auth
npm install next-auth@beta @auth/prisma-adapter

# Database
npm install prisma @prisma/client
npm install -D prisma

# Validation & utilities
npm install zod bcryptjs
npm install -D @types/bcryptjs

# PWA
npm install next-pwa
```

### 3. Install shadcn/ui

```bash
npx shadcn@latest init
```

When prompted:
- Style: **Default**
- Base color: **Slate**
- CSS variables: **Yes**

Then add commonly needed components:
```bash
npx shadcn@latest add button card dialog form input label select toast badge progress tabs
```

### 4. Initialize Prisma

```bash
npx prisma init
```

This creates `prisma/schema.prisma` and updates `.env` with `DATABASE_URL`.

### 5. Configure TypeScript Path Aliases

In `tsconfig.json`, ensure:
```json
{
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

---

## Environment Variables

Create `.env.local` in project root (never commit this file):

```env
# Database
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/nukezone_reborn?schema=public"

# NextAuth
NEXTAUTH_SECRET="generate-with: openssl rand -base64 32"
NEXTAUTH_URL="http://localhost:3000"

# OAuth Providers (optional for development)
DISCORD_CLIENT_ID=""
DISCORD_CLIENT_SECRET=""
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# WebSocket Server
NEXT_PUBLIC_WEBSOCKET_URL="http://localhost:3001"
WEBSOCKET_INTERNAL_SECRET="generate-with: openssl rand -base64 32"

# Game Config
GAME_TICK_INTERVAL_MS=5000
```

A `.env.example` file (committed to git) mirrors this with empty values.

---

## Database Setup

### Option A: Local PostgreSQL

```bash
# Create database
createdb nukezone_reborn

# Or via psql:
psql -U postgres -c "CREATE DATABASE nukezone_reborn;"
```

### Option B: Docker

```bash
docker run --name nukezone-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=nukezone_reborn \
  -p 5432:5432 \
  -d postgres:15
```

### Run Migrations

```bash
# Development (creates migration files)
npx prisma migrate dev --name init

# Production (apply existing migrations)
npx prisma migrate deploy

# Seed the database (weapon types, etc.)
npx prisma db seed
```

### Open Prisma Studio (DB GUI)

```bash
npx prisma studio
```

---

## Development Startup

```bash
# Install dependencies (after cloning)
npm install

# Start Next.js dev server (with Turbopack)
npm run dev

# In a separate terminal, start WebSocket server (when implemented)
npm run dev:ws
```

App runs at: `http://localhost:3000`

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Next.js dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run type-check` | Run TypeScript type check |
| `npm run test` | Run Vitest unit tests |
| `npm run test:watch` | Vitest in watch mode |
| `npx prisma studio` | Open DB GUI |
| `npx prisma migrate dev` | Create and apply new migration |
| `npx prisma generate` | Regenerate Prisma client after schema change |

---

## IDE Setup (VS Code)

Recommended extensions:
- **Prisma** (Prisma.prisma) — schema highlighting and formatting
- **Tailwind CSS IntelliSense** (bradlc.vscode-tailwindcss)
- **ESLint** (dbaeumer.vscode-eslint)
- **Prettier** (esbenp.prettier-vscode)

Add to `.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "tailwindCSS.experimental.classRegex": [
    ["cva\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"]
  ]
}
```

---

## Production Deployment

### Vercel (Frontend + API Routes)

```bash
npm install -g vercel
vercel
```

Set environment variables in Vercel Dashboard.

After deploy, run DB migrations:
```bash
npx prisma migrate deploy
```

### Railway (Database + WS Server)

1. Create PostgreSQL service on Railway
2. Copy `DATABASE_URL` to Vercel env vars
3. Deploy WS server as separate Railway service
4. Set `NEXT_PUBLIC_WEBSOCKET_URL` to Railway WS service URL
