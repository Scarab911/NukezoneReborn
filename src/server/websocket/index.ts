import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { redis, redisSub } from "@/lib/redis";
import { logger } from "@/lib/logger";

const PORT = Number(process.env.WS_PORT ?? 3001);

export function createSocketServer(httpServer: ReturnType<typeof createServer>): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin:      process.env.NEXTAUTH_URL ?? "http://localhost:3000",
      credentials: true,
    },
    transports:    ["websocket", "polling"],
    pingTimeout:   30_000,
    pingInterval:  10_000,
  });

  // Redis adapter — required for multi-instance scaling
  io.adapter(createAdapter(redis, redisSub));

  const playerNS = io.of("/player");

  // Auth middleware
  playerNS.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Unauthorized"));
    // TODO (M3): validate JWT token, attach playerId/nationId to socket.data
    socket.data.nationId = token; // placeholder
    next();
  });

  playerNS.on("connection", async (socket) => {
    const nationId: string = socket.data.nationId;

    socket.join(`player:${nationId}`);
    await redis.setex(`session:ws:${socket.id}`, 86400, nationId);

    logger.info({ nationId, socketId: socket.id }, "Player connected");

    socket.on("disconnect", async () => {
      await redis.del(`session:ws:${socket.id}`);
      logger.info({ nationId, socketId: socket.id }, "Player disconnected");
    });
  });

  // Subscribe to internal pub/sub and fan out to clients
  redisSub.subscribe("ws:emit");
  redisSub.on("message", (_ch, raw) => {
    const { target, room, event, data } = JSON.parse(raw) as {
      target: string; room: string; event: string; data: unknown;
    };
    if (target === "player" || target === "world" || target === "alliance") {
      playerNS.to(room).emit(event, data);
    }
  });

  return io;
}

// Standalone entry point: node dist/server/websocket/index.js
if (require.main === module) {
  const httpServer = createServer();
  createSocketServer(httpServer);
  httpServer.listen(PORT, () => {
    logger.info({ port: PORT }, "WebSocket server listening");
  });
}
