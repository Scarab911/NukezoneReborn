# REALTIME ARCHITECTURE — NukezoneReborn

## Fundamental Rule

> **The client is a display terminal.** It never computes authoritative game state.
> WebSocket events carry notification data, not game state snapshots.
> All authoritative state is fetched from the REST API.

---

## What is Real-time vs What is Not

This distinction is critical for bandwidth, correctness, and security.

| Data | Delivery | Reason |
|---|---|---|
| Incoming attack alert | WS push (immediate) | Time-critical — player needs to prepare defenses |
| Battle resolved | WS push | Notification of completion |
| Spy/thief detected | WS push | Security alert |
| Diplomacy proposal | WS push | Player action pending |
| World event started | WS broadcast | Affects all players |
| Own economy snapshot | WS push (per tick) | Low-latency feedback |
| Leaderboard rankings | REST poll (5min) | Not urgent; WS would be too noisy |
| Market prices | REST poll (60s) | Price feeds are noisy; too much bandwidth |
| Own battle reports | REST on-demand | Fetched after WS notification |
| Alliance chat | WS push | Real-time communication |
| Enemy army positions | NEVER pushed | Anti-intel — attacker's position is secret until detonation |
| Spy operation status | NEVER pushed during | Would reveal ongoing ops |

---

## Socket.io Room Strategy

```
Namespaces:
  /game     ← World-level events (same game world)
  /player   ← Per-player private events

Rooms within /game namespace:
  world:{worldId}              ← All players in world (world events, map updates)
  alliance:{allianceId}        ← Alliance members (alliance comms, treasury updates)

Rooms within /player namespace:
  player:{playerId}            ← Private to one player (attacks, battle results, spy reports)
```

### Why Two Namespaces?

Separation allows different connection auth strategies:
- `/game` connections validate worldId membership
- `/player` connections validate only playerId

Reduces event routing complexity — world-level events never accidentally leak to wrong players.

---

## Connection Architecture

```typescript
// src/server/websocket/index.ts

import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redis, redisSub } from '@/lib/redis';

export function createSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new Server(httpServer, {
    cors: { origin: process.env.NEXTAUTH_URL, credentials: true },
    transports: ['websocket', 'polling'], // polling as fallback
    pingTimeout: 30_000,
    pingInterval: 10_000,
  });

  // Redis adapter — required for multi-instance WS scaling
  io.adapter(createAdapter(redis, redisSub));

  const gameNS = io.of('/game');
  const playerNS = io.of('/player');

  // Auth middleware for /player namespace
  playerNS.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    const session = await validateSessionToken(token);
    if (!session) return next(new Error('Unauthorized'));
    socket.data.playerId = session.playerId;
    socket.data.nationId = session.nationId;
    socket.data.worldId = session.worldId;
    next();
  });

  playerNS.on('connection', async (socket) => {
    // Join player's private room
    socket.join(`player:${socket.data.playerId}`);
    
    // Store socket → player mapping in Redis (for broadcast lookup)
    await redis.setex(`session:ws:${socket.id}`, 86400, socket.data.playerId);

    // Mark player as online
    await playerService.setOnlineStatus(socket.data.playerId, true);

    socket.on('disconnect', async () => {
      await redis.del(`session:ws:${socket.id}`);
      await playerService.setOnlineStatus(socket.data.playerId, false);
    });

    // Players can subscribe to their world room via /player namespace
    socket.join(`world:${socket.data.worldId}`);
  });

  return io;
}
```

---

## Event Broadcasting (Internal → WS)

Workers and API routes cannot call Socket.io directly — they run in separate processes. Communication happens through Redis pub/sub.

```
Worker process / API route
        │
        ▼ redis.publish('ws:emit', JSON.stringify(event))
        │
Redis pub/sub channel: 'ws:emit'
        │
        ▼ WS server subscribes and routes
Socket.io server
        │
        ▼ io.of('/player').to(`player:${playerId}`).emit(event.name, event.data)
```

```typescript
// src/server/websocket/broadcast.ts — used by workers and services

export async function emitToPlayer(playerId: string, event: string, data: unknown): Promise<void> {
  await redis.publish('ws:emit', JSON.stringify({
    target: 'player',
    room: `player:${playerId}`,
    event,
    data,
  }));
}

export async function emitToWorld(worldId: string, event: string, data: unknown): Promise<void> {
  await redis.publish('ws:emit', JSON.stringify({
    target: 'world',
    room: `world:${worldId}`,
    event,
    data,
  }));
}

export async function emitToAlliance(allianceId: string, event: string, data: unknown): Promise<void> {
  await redis.publish('ws:emit', JSON.stringify({
    target: 'alliance',
    room: `alliance:${allianceId}`,
    event,
    data,
  }));
}

// WS server listener (runs inside the socket server process)
redisSub.subscribe('ws:emit');
redisSub.on('message', (_channel, message) => {
  const { target, room, event, data } = JSON.parse(message);
  switch (target) {
    case 'player':   playerNS.to(room).emit(event, data); break;
    case 'world':    gameNS.to(room).emit(event, data);   break;
    case 'alliance': gameNS.to(room).emit(event, data);   break;
  }
});
```

---

## Offline Buffering

Players who disconnect must not miss critical events.

```typescript
// When emitting a critical event, also store in Notification table
// Player fetches buffered notifications on reconnect

async function emitWithBuffer(
  playerId: string,
  event: string,
  data: unknown,
  isCritical: boolean,
): Promise<void> {
  // Always try real-time first
  await emitToPlayer(playerId, event, data);

  // For critical events: persist to DB regardless of online status
  // Client fetches these on reconnect/load via GET /api/notifications
  if (isCritical) {
    await prisma.notification.create({
      data: {
        playerId,
        type: event,
        payload: data as Prisma.JsonObject,
        delivered: false,
      },
    });
  }
}

// On client connect:
// TanStack Query fetches GET /api/notifications?unread=true
// These are notifications that arrived while the player was offline
```

---

## Client-Side WS Architecture

```typescript
// src/lib/socket.ts — singleton, reconnects automatically

import { io, Socket } from 'socket.io-client';
import { useGameStore } from '@/store/useGameStore';
import { useNotificationStore } from '@/store/useNotificationStore';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket?.connected) return socket;

  socket = io(process.env.NEXT_PUBLIC_WEBSOCKET_URL + '/player', {
    auth: { token: getSessionToken() },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30_000,
    timeout: 10_000,
  });

  // Route incoming events to Zustand stores — components never touch socket directly
  socket.on('economy:update',        (data) => useGameStore.getState().setEconomy(data));
  socket.on('battle:resolved',       (data) => useNotificationStore.getState().addAlert({ type: 'BATTLE', ...data }));
  socket.on('alert:incoming',        (data) => useNotificationStore.getState().addAlert({ type: 'INCOMING_ATTACK', ...data, urgent: true }));
  socket.on('espionage:spy_detected',(data) => useNotificationStore.getState().addAlert({ type: 'SPY_DETECTED', ...data }));
  socket.on('diplomacy:proposal',    (data) => useNotificationStore.getState().addAlert({ type: 'DIPLOMACY', ...data }));
  socket.on('worldevent:started',    (data) => useGameStore.getState().setWorldEvent(data));
  socket.on('research:completed',    (data) => useGameStore.getState().addCompletedResearch(data));

  socket.on('connect_error', (err) => {
    console.warn('[WS] Connection error, will retry:', err.message);
  });

  return socket;
}

// Called once from root layout (client component)
export function useSocketInit(): void {
  useEffect(() => {
    const s = getSocket();
    return () => { /* do not disconnect on unmount — singleton persists */ };
  }, []);
}
```

---

## Reconnection Handling

```
Client disconnects (network drop, tab sleep, etc.)
        │
        ▼ Socket.io auto-reconnects (exponential backoff)
        │
On reconnect:
  1. socket.on('connect') fires
  2. Client emits 'client:rehydrate' with { lastEventTimestamp }
  3. Server checks for buffered notifications since lastEventTimestamp
  4. Server sends missed events in order
  5. TanStack Query refetches all stale queries (invalidateQueries)
        │
Client is back in sync
```

```typescript
socket.on('connect', async () => {
  const lastSeen = localStorage.getItem('ws:lastEventTimestamp') ?? '0';
  socket.emit('client:rehydrate', { since: Number(lastSeen) });
});

socket.on('client:missed_events', (events: StoredEvent[]) => {
  // Process missed events in order
  events.sort((a, b) => a.timestamp - b.timestamp);
  for (const event of events) {
    socket.emit(event.name, event.data); // replay through normal handlers
  }
  queryClient.invalidateQueries(); // force refetch of all stale data
});
```

---

## Bandwidth Optimization

### Partial Updates (delta compression)

Economy ticks do NOT send the full nation state. They send only the changed fields:

```typescript
// BAD — sends entire nation object (expensive, leaks internal state)
socket.emit('economy:update', fullNationObject);

// GOOD — sends only what changed since last push
socket.emit('economy:update', {
  gold: 45231,
  food: 1203,
  morale: 72,
  // Only changed fields
});
```

### Rate-limiting WS emissions

```typescript
// Per-player WS emission rate: max 20 events/second
// Prevents worker bugs from flooding a client
const playerEmitRateLimiter = new Map<string, number>();

async function emitToPlayer(playerId: string, event: string, data: unknown): Promise<void> {
  const now = Date.now();
  const lastEmit = playerEmitRateLimiter.get(playerId) ?? 0;
  
  if (now - lastEmit < 50) {
    // Queue instead of emitting immediately
    await bullmq.add('notification:send', { playerId, event, data }, { delay: 50 });
    return;
  }
  
  playerEmitRateLimiter.set(playerId, now);
  // ... emit
}
```

### What is Never Pushed Live

```typescript
// These are NEVER emitted via WebSocket — always fetched on-demand via REST
const NEVER_PUSH = [
  'enemy_army_positions',       // Reveals attacker position — defeats game mechanics
  'spy_operation_status',       // Reveals active operations — defeats espionage
  'opponent_resource_amounts',  // Only revealed via spy ops
  'battle_seed',                // Never exposed to client at all
  'ci_rating_details',          // Internal CI rating is private
];
```
