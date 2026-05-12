import { redis } from "@/lib/redis";

// ── Internal pub/sub channel ─────────────────────────────────────────────────
// Workers and API routes publish here.
// The Socket.io server (separate process) subscribes and fans out to clients.

const WS_CHANNEL = "ws:emit";

interface EmitPayload {
  target: "player" | "world" | "alliance";
  room:   string;
  event:  string;
  data:   unknown;
}

async function publish(payload: EmitPayload): Promise<void> {
  await redis.publish(WS_CHANNEL, JSON.stringify(payload));
}

export async function emitToPlayer(
  nationId: string,
  event: string,
  data: unknown,
): Promise<void> {
  await publish({ target: "player", room: `player:${nationId}`, event, data });
}

export async function emitToWorld(
  worldId: string,
  event: string,
  data: unknown,
): Promise<void> {
  await publish({ target: "world", room: `world:${worldId}`, event, data });
}

export async function emitToAlliance(
  allianceId: string,
  event: string,
  data: unknown,
): Promise<void> {
  await publish({ target: "alliance", room: `alliance:${allianceId}`, event, data });
}
