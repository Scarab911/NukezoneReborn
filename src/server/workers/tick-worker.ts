import { Worker } from "bullmq";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { withLock } from "@/lib/lock";

// In the turn-based redesign, the economy tick handles:
// - Income accumulation per nation (money = land×rate × morale)
// - Morale regen
// Note: combat is instant, no fast-tick missile advancement needed.

const DEFAULT_WORLD_ID = process.env.GAME_WORLD_ID ?? "world_01";
const ECONOMY_TTL_MS   = 28_000; // 2s buffer below 30s tick

export function startTickWorker(): void {
  const economyWorker = new Worker(
    "tick:economy",
    async () => {
      await withLock(`economy-tick:${DEFAULT_WORLD_ID}`, ECONOMY_TTL_MS, async () => {
        logger.debug({ worldId: DEFAULT_WORLD_ID }, "Economy tick");
        // TODO: call processTick() for all active nations
      });
    },
    { connection: redis, concurrency: 1 },
  );

  economyWorker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Economy tick failed");
  });

  logger.info("Tick worker started");
}
