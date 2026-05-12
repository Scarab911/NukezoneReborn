/**
 * Worker process entry point.
 * Run with: node dist/server/workers/index.js
 *
 * Each worker type handles a specific queue.
 * tick-worker and battle-worker are the highest priority.
 */

import { logger } from "@/lib/logger";
import { registerRepeatableJobs } from "@/server/queues";

async function main() {
  logger.info("Starting game workers...");

  // Register repeatable tick jobs (idempotent — safe on every startup)
  await registerRepeatableJobs();

  // Dynamically import workers to allow tree-shaking in other contexts
  const { startTickWorker }         = await import("./tick-worker");
  const { startBattleWorker }       = await import("./battle-worker");
  const { startNotificationWorker } = await import("./notification-worker");

  startTickWorker();
  startBattleWorker();
  startNotificationWorker();

  logger.info("All workers started");

  // Keep the process alive
  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received — shutting down workers gracefully");
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ err }, "Worker startup failed");
  process.exit(1);
});
