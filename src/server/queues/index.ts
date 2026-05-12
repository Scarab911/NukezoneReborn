import { Queue } from "bullmq";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";

const connection = redis;

// ── Queue definitions ────────────────────────────────────────────────────────

export const queues = {
  fastTick:     new Queue("tick:fast",          { connection }),
  economyTick:  new Queue("tick:economy",        { connection }),
  marketTick:   new Queue("tick:market",         { connection }),
  bankTick:     new Queue("tick:bank",           { connection }),
  worldTick:    new Queue("tick:world",          { connection }),
  maintenance:  new Queue("tick:maintenance",    { connection }),

  battle:       new Queue("battle:resolve",      { connection }),
  research:     new Queue("research:complete",   { connection }),
  espionage:    new Queue("espionage:resolve",   { connection }),
  thief:        new Queue("thief:resolve",       { connection }),
  notification: new Queue("notification:send",   {
    connection,
    defaultJobOptions: { priority: 1 },
  }),
} as const;

// ── Repeatable job registration ──────────────────────────────────────────────
// Safe to call on every server start — BullMQ deduplicates by jobId.

export async function registerRepeatableJobs(): Promise<void> {
  const jobs: Array<{
    queue: Queue;
    name: string;
    jobId: string;
    every: number;
  }> = [
    { queue: queues.fastTick,    name: "fast-tick",        jobId: "fast-tick",        every: 5_000 },
    { queue: queues.economyTick, name: "economy-tick",     jobId: "economy-tick",     every: 30_000 },
    { queue: queues.marketTick,  name: "market-tick",      jobId: "market-tick",      every: 300_000 },
    { queue: queues.bankTick,    name: "bank-tick",        jobId: "bank-tick",        every: 3_600_000 },
    { queue: queues.worldTick,   name: "world-tick",       jobId: "world-tick",       every: 3_600_000 },
    { queue: queues.maintenance, name: "maintenance-tick", jobId: "maintenance-tick", every: 86_400_000 },
  ];

  for (const { queue, name, jobId, every } of jobs) {
    await queue.add(name, {}, { repeat: { every }, jobId });
    logger.info({ queue: queue.name, every }, "Repeatable job registered");
  }
}

// ── Delayed job helpers ──────────────────────────────────────────────────────

export async function scheduleBattleResolution(
  battleId: string,
  delayMs: number,
): Promise<void> {
  await queues.battle.add(
    "resolve",
    { battleId },
    { delay: delayMs, jobId: `battle:${battleId}`, attempts: 5, backoff: { type: "exponential", delay: 5_000 } },
  );
}

export async function scheduleResearchCompletion(
  nationId: string,
  techNodeId: string,
  delayMs: number,
): Promise<void> {
  await queues.research.add(
    "complete",
    { nationId, techNodeId },
    { delay: delayMs, jobId: `research:${nationId}:${techNodeId}`, attempts: 3 },
  );
}

export async function scheduleEspionageResolution(
  operationId: string,
  delayMs: number,
): Promise<void> {
  await queues.espionage.add(
    "resolve",
    { operationId },
    { delay: delayMs, jobId: `espionage:${operationId}`, attempts: 3 },
  );
}

export async function scheduleThiefResolution(
  operationId: string,
  delayMs: number,
): Promise<void> {
  await queues.thief.add(
    "resolve",
    { operationId },
    { delay: delayMs, jobId: `thief:${operationId}`, attempts: 3 },
  );
}

export async function sendNotification(payload: {
  type: string;
  nationIds: string[];
  data: Record<string, unknown>;
}): Promise<void> {
  await queues.notification.add("send", payload, { attempts: 3 });
}
