# DEVOPS & INFRASTRUCTURE — NukezoneReborn

## Deployment Phases

### Phase 1 — MVP (Early Access, <1k players)
Simple, cheap, fast to deploy:
- **Vercel** (Next.js frontend + API routes)
- **Railway** (PostgreSQL + Redis + WS server + Worker processes)
- Estimated cost: ~$30–80/month

### Phase 2 — Growth (1k–10k players)
Add read replica, separate worker scaling:
- Vercel Pro
- Railway with dedicated resources
- PgBouncer connection pooler
- Estimated cost: ~$200–500/month

### Phase 3 — Scale (10k+ players)
Kubernetes, Redis Cluster, proper observability:
- GKE or EKS
- Redis Cluster (3 shards, 6 nodes)
- PostgreSQL with streaming replication + read replicas
- Estimated cost: $1k–5k/month

---

## Phase 1 Infrastructure

```
Vercel (Edge Network)
├── Next.js App (SSR + API routes)
└── Edge Middleware (rate limiting via Upstash)

Railway Services:
├── postgresql-primary   (PostgreSQL 15)
├── redis-primary        (Redis 7)
├── ws-server            (Socket.io standalone Node.js)
└── game-workers         (BullMQ workers: tick, battle, espionage, notification)
```

### Railway Service Configuration

```yaml
# railway.toml

[deploy]
  restartPolicyType = "ON_FAILURE"
  restartPolicyMaxRetries = 3

# WS Server service
[[services]]
  name = "ws-server"
  [services.deploy]
    startCommand = "node dist/server/websocket/index.js"
    healthcheckPath = "/health"
    healthcheckTimeout = 10

# Game Workers service
[[services]]
  name = "game-workers"  
  [services.deploy]
    startCommand = "node dist/server/workers/index.js"
    # Workers don't need HTTP — no healthcheck port needed
```

---

## Phase 3: Kubernetes Architecture

```yaml
# Namespace: nukezone-prod

Deployments:
  next-app          replicas: 3  (Next.js SSR pods)
  ws-server         replicas: 2  (Socket.io with Redis adapter)
  tick-worker       replicas: 1  (MUST be single instance — tick deduplication via Redis lock)
  battle-worker     replicas: 3  (Parallelizable — different battles)
  ops-worker        replicas: 2  (Spy/thief ops)
  notification-worker replicas: 2

Services:
  next-app-svc      ClusterIP + Ingress (HTTPS)
  ws-server-svc     LoadBalancer (WebSocket)

StatefulSets:
  postgres-primary  1 replica
  postgres-replica  2 replicas
  redis-cluster     6 replicas (3 shards × 2)

Ingress:
  HTTPS → next-app (api.*, app.*)
  WSS   → ws-server (ws.*)

HorizontalPodAutoscaler:
  next-app: min=2, max=10, targetCPU=70%
  battle-worker: min=1, max=8, targetQueueDepth=20
```

### tick-worker: Why Exactly 1 Replica

The tick worker must be a singleton per game world to prevent:
- Double-processing economy ticks (double income for players)
- Duplicate battle resolutions

The Redis lock (`lock:fast-tick:{worldId}`) ensures only one tick runs at a time even if multiple instances exist, but running 1 replica keeps lock contention minimal and avoids wasted duplicate startups.

---

## CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml

name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env: { POSTGRES_DB: nukezone_test, POSTGRES_PASSWORD: test }
      redis:
        image: redis:7
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run type-check
      - run: npm run lint
      - run: npx prisma migrate deploy
        env: { DATABASE_URL: postgresql://postgres:test@localhost:5432/nukezone_test }
      - run: npm test

  deploy-preview:
    needs: test
    if: github.ref != 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with: { vercel-token: ${{ secrets.VERCEL_TOKEN }}, vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}, vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }} }

  deploy-production:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      # Run DB migrations before app deployment
      - name: Run DB Migrations
        run: npx prisma migrate deploy
        env: { DATABASE_URL: ${{ secrets.DATABASE_URL }} }
      
      # Deploy Next.js to Vercel
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-args: '--prod'
      
      # Deploy workers + WS server to Railway
      - name: Deploy to Railway
        run: railway up --service game-workers
        env: { RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }} }
```

---

## Blue-Green Deployment Strategy

For zero-downtime deployments when schema changes are involved:

```
STEP 1: Deploy new schema migration (backward-compatible only)
   → New columns are nullable or have defaults
   → Old code still works with new schema

STEP 2: Deploy new application code (Blue → Green traffic shift)
   → Vercel handles this automatically via atomic deploys
   → Railway: use railway up --detach, then manually shift traffic

STEP 3: Run data migration if needed
   → Background job that fills new columns
   → Does not block traffic

STEP 4: Remove compatibility shims in next release
```

**Rule**: Never deploy breaking schema changes and application code simultaneously. Always deploy schema first, validate, then deploy code.

---

## Canary Releases

For significant feature rollouts:

```typescript
// Feature flags — simple Redis-backed
// Later: replace with LaunchDarkly or Unleash

async function isFeatureEnabled(feature: string, playerId: string): Promise<boolean> {
  // Global flag
  const globalFlag = await redis.get(`feature:${feature}:enabled`);
  if (globalFlag === '1') return true;
  if (globalFlag === '0') return false;

  // Player-specific flag (canary)
  const playerFlag = await redis.get(`feature:${feature}:player:${playerId}`);
  return playerFlag === '1';
}

// Enable for 10% of players (canary)
async function enableCanary(feature: string, percentage: number): Promise<void> {
  const allPlayerIds = await prisma.player.findMany({ select: { id: true } });
  const canaryCount = Math.floor(allPlayerIds.length * (percentage / 100));
  const canaryPlayers = shuffleArray(allPlayerIds).slice(0, canaryCount);
  
  const pipeline = redis.pipeline();
  for (const { id } of canaryPlayers) {
    pipeline.set(`feature:${feature}:player:${id}`, '1');
  }
  await pipeline.exec();
}
```

---

## Observability Stack

### Structured Logging (Pino)

```typescript
// src/lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: { service: process.env.SERVICE_NAME ?? 'nukezone' },
});

// Usage — structured, not string interpolation
logger.info({ nationId, goldDelta, tickNumber }, 'Economy tick processed');
logger.error({ battleId, error: err.message }, 'Battle resolution failed');
```

All logs shipped to: **Axiom** (free tier covers MVP) or **Datadog** (at scale).

### Distributed Tracing (OpenTelemetry)

```typescript
// src/server/instrumentation.ts — Next.js instrumentation file
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_URL }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
```

Traces flow: API Request → Service Layer → Database Queries — visible in Jaeger or Grafana Tempo.

### Metrics (Prometheus + Grafana)

Key metrics to collect:

```typescript
// src/server/metrics.ts
import { Counter, Histogram, Gauge, register } from 'prom-client';

export const metrics = {
  // Game metrics
  battlesResolved: new Counter({ name: 'battles_resolved_total', labelNames: ['worldId', 'winner'] }),
  economyTickDuration: new Histogram({ name: 'economy_tick_duration_ms', buckets: [10, 50, 100, 500, 1000, 5000] }),
  activeNations: new Gauge({ name: 'active_nations_total', labelNames: ['worldId'] }),
  onlinePlayers: new Gauge({ name: 'online_players_total' }),
  
  // Infrastructure metrics
  queueDepth: new Gauge({ name: 'bullmq_queue_depth', labelNames: ['queue'] }),
  wsConnections: new Gauge({ name: 'websocket_connections_total' }),
  dbQueryDuration: new Histogram({ name: 'db_query_duration_ms', labelNames: ['operation'] }),
  
  // Business metrics
  actionsPerMinute: new Counter({ name: 'player_actions_total', labelNames: ['type'] }),
  nuclearLaunches: new Counter({ name: 'nuclear_launches_total', labelNames: ['worldId', 'weaponType'] }),
};

// Expose /metrics endpoint for Prometheus scraping
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

**Alerts to set up in Grafana:**
- Economy tick taking > 25s (approaching 30s window)
- BullMQ battle queue depth > 50 jobs (battle-worker overwhelmed)
- DB connection pool utilization > 80%
- Error rate > 1% on any API route
- Tick worker dead (no tick processed in > 60s)

---

## Disaster Recovery

### Backup Strategy

```bash
# PostgreSQL: daily full backup + continuous WAL archiving
# Via Railway: automatic daily backups (7-day retention)
# Via pg_dump: daily snapshot to R2 (30-day retention)

0 3 * * * pg_dump $DATABASE_URL | gzip | rclone rcat r2:backups/nukezone/$(date +%Y%m%d).sql.gz
```

### Recovery Runbook

```
SCENARIO: Database corruption / data loss

1. Stop all workers immediately (prevent further writes to corrupted state)
   railway service suspend game-workers

2. Take a snapshot of current broken state (for forensics)
   pg_dump $DATABASE_URL > broken_state_$(date +%Y%m%d_%H%M%S).sql

3. Restore from latest clean backup
   pg_restore < backup_20260508.sql

4. Replay WAL from backup timestamp to latest safe point
   pg_waldump ...

5. Manually reconcile any events after the backup that are in GameLog
   (GameLog is append-only — use it to replay events)

6. Restart workers
   railway service resume game-workers

7. Notify players of rollback window
   worldEventService.announceSystemRollback(rollbackWindowMinutes)
```

### GameLog as Recovery Safety Net

The append-only `GameLog` table is critical for disaster recovery. Even after restoring from a backup, events can be replayed:

```typescript
// Recovery script: replay events after backup restore point
async function replayEventsAfterBackup(backupTimestamp: Date): Promise<void> {
  const events = await prisma.gameLog.findMany({
    where: { timestamp: { gt: backupTimestamp } },
    orderBy: { timestamp: 'asc' },
  });

  for (const event of events) {
    await replayEvent(event);
    // Log progress so we can resume if interrupted
  }
}
```

---

## Environment Variable Reference

```env
# Required — Production
DATABASE_URL=                        # PostgreSQL connection string (PgBouncer URL)
DIRECT_DATABASE_URL=                 # Direct Postgres URL (for Prisma migrations)
REDIS_URL=                           # Redis connection URL
NEXTAUTH_SECRET=                     # Random 32-byte secret
NEXTAUTH_URL=                        # Canonical app URL (https://nukezone.gg)
NEXT_PUBLIC_WEBSOCKET_URL=           # WS server URL (wss://ws.nukezone.gg)
WEBSOCKET_INTERNAL_SECRET=           # Shared secret for API → WS communication

# Optional — Integrations
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
UPSTASH_REDIS_REST_URL=              # For Edge rate limiting (separate from main Redis)
UPSTASH_REDIS_REST_TOKEN=
OTEL_EXPORTER_URL=                   # OpenTelemetry collector endpoint
R2_ACCOUNT_ID=                       # Cloudflare R2 for archive storage
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=

# Game Config
GAME_TICK_INTERVAL_MS=5000           # Fast tick interval
ECONOMY_TICK_INTERVAL_MS=30000       # Economy tick interval
GAME_WORLD_ID=world_01               # Default world ID
LOG_LEVEL=info                       # pino log level
SERVICE_NAME=nukezone-api            # For structured logs
```
