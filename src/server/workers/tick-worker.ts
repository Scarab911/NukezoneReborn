import { Worker } from "bullmq";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { withLock } from "@/lib/lock";
import { TICK } from "@/lib/game-constants";

const DEFAULT_WORLD_ID = process.env.GAME_WORLD_ID ?? "world_01";

export function startTickWorker(): void {
  // Fast tick worker
  const fastWorker = new Worker(
    "tick:fast",
    async () => {
      await withLock(`fast-tick:${DEFAULT_WORLD_ID}`, TICK.FAST_MS - 100, async () => {
        logger.debug({ worldId: DEFAULT_WORLD_ID }, "Fast tick processing");
        // TODO (M2): advance missile flights, army movements
      });
    },
    { connection: redis, concurrency: 1 },
  );

  // Economy tick worker
  const economyWorker = new Worker(
    "tick:economy",
    async () => {
      await withLock(`economy-tick:${DEFAULT_WORLD_ID}`, TICK.ECONOMY_MS - 2_000, async () => {
        logger.debug({ worldId: DEFAULT_WORLD_ID }, "Economy tick processing");
        // TODO (M2): resource accumulation, upkeep, starvation, morale regen
      });
    },
    { connection: redis, concurrency: 1 },
  );

  fastWorker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Fast tick failed");
  });

  economyWorker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Economy tick failed");
  });

  logger.info("Tick worker started");
}
