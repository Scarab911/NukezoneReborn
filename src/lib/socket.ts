"use client";

import { io, type Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@/types/socket";
import { useGameStore } from "@/store/useGameStore";
import { useUIStore } from "@/store/useUIStore";

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;

export function getSocket(): GameSocket {
  if (socket?.connected) return socket;

  socket = io(
    (process.env.NEXT_PUBLIC_WEBSOCKET_URL ?? "http://localhost:3001") + "/player",
    {
      auth:                    { token: "dev" }, // replaced with real JWT in M3
      reconnection:            true,
      reconnectionAttempts:    Infinity,
      reconnectionDelay:       1_000,
      reconnectionDelayMax:    30_000,
      timeout:                 10_000,
      transports:              ["websocket", "polling"],
    },
  ) as GameSocket;

  // Route events → Zustand stores — components never touch the socket
  socket.on("economy:update",   (data) => useGameStore.getState().setResources(data));
  socket.on("worldevent:started",(data) => useGameStore.getState().setWorldEvent(data));
  socket.on("worldevent:ended", ({ eventId }) => useGameStore.getState().clearWorldEvent(eventId));
  socket.on("research:completed",(data) => useGameStore.getState().addCompletedResearch(data.techNodeId));

  socket.on("alert:incoming",   (data) => useUIStore.getState().addAlert({ type: "INCOMING_ATTACK", data }));
  socket.on("battle:resolved",  (data) => useUIStore.getState().addAlert({ type: "BATTLE_RESOLVED", data }));
  socket.on("espionage:spy_detected", (data) =>
    useUIStore.getState().addAlert({ type: "SPY_DETECTED", data: { message: data.captured ? "Spy captured!" : "Spy detected" } }),
  );

  socket.on("connect_error", () => {
    // Silent — WS server may not be running in dev; app degrades gracefully
  });

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
