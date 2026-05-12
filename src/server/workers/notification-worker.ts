import { Worker } from "bullmq";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";

export function startNotificationWorker(): void {
  const worker = new Worker(
    "notification:send",
    async (job) => {
      const { type, nationIds, data } = job.data as {
        type: string;
        nationIds: string[];
        data: Record<string, unknown>;
      };

      logger.debug({ type, nationIds }, "Sending notification");

      for (const nationId of nationIds) {
        await redis.publish(
          "ws:emit",
          JSON.stringify({ target: "player", room: `player:${nationId}`, event: type, data }),
        );
      }
    },
    { connection: redis, concurrency: 10 },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Notification send failed");
  });

  logger.info("Notification worker started");
}
