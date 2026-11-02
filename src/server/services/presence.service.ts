import { prisma } from "@/lib/db";

/** A player counts as online if they were active within this window. */
export const ONLINE_WINDOW_MS = 5 * 60_000;

/** Skip the DB write if activity was already recorded this recently. */
const TOUCH_THROTTLE_MS = 60_000;

/**
 * Records that a player is active. Throttled at the query level: the row is
 * only written when the last recorded activity is older than the throttle
 * window, so frequent calls cost a single no-op UPDATE.
 */
export async function touchPlayerActivity(playerId: string): Promise<void> {
  const now = new Date();
  await prisma.player.updateMany({
    where: {
      id: playerId,
      OR: [
        { lastActiveAt: null },
        { lastActiveAt: { lt: new Date(now.getTime() - TOUCH_THROTTLE_MS) } },
      ],
    },
    data: { lastActiveAt: now },
  });
}

export async function countOnlinePlayers(): Promise<number> {
  return prisma.player.count({
    where: { lastActiveAt: { gte: new Date(Date.now() - ONLINE_WINDOW_MS) } },
  });
}
