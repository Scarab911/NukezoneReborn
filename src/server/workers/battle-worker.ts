import { Worker } from "bullmq";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { withLock } from "@/lib/lock";
import { prisma } from "@/lib/db";

export function startBattleWorker(): void {
  const worker = new Worker(
    "battle:resolve",
    async (job) => {
      const { battleId } = job.data as { battleId: string };

      await withLock(`battle:${battleId}`, 30_000, async () => {
        const battle = await prisma.battle.findUnique({ where: { id: battleId } });
        if (!battle || battle.status !== "PENDING") return; // idempotent

        logger.info({ battleId }, "Resolving battle");
        // TODO (M2): call battleEngine.resolve(battleId)
      });
    },
    { connection: redis, concurrency: 5 },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, battleId: job?.data?.battleId, err }, "Battle resolution failed");
  });

  logger.info("Battle worker started");
}
