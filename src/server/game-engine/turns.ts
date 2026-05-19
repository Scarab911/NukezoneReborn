import { TURNS } from "@/lib/game-constants";
import { prisma } from "@/lib/db";

/**
 * Calculates how many turns have regenerated since turnsRegenAt
 * and returns the new turn count (clamped to maxTurns).
 * Pure function — no DB writes.
 */
export function calcTurns(
  current: number,
  maxTurns: number,
  regenAt:  Date,
): { newTurns: number; elapsed: number } {
  const msSinceLast = Date.now() - regenAt.getTime();
  const elapsed     = Math.floor(msSinceLast / TURNS.REGEN_INTERVAL_MS);
  const newTurns    = Math.min(maxTurns, current + elapsed);
  return { newTurns, elapsed };
}

/**
 * Syncs regenerated turns to DB for a nation.
 * Call on every page load / action to keep turns current.
 */
export async function syncTurns(nationId: string): Promise<number> {
  const nation = await prisma.nation.findUniqueOrThrow({
    where:  { id: nationId },
    select: { turns: true, maxTurns: true, turnsRegenAt: true },
  });

  const { newTurns, elapsed } = calcTurns(
    nation.turns,
    nation.maxTurns,
    nation.turnsRegenAt,
  );

  if (elapsed === 0) return nation.turns;

  await prisma.nation.update({
    where: { id: nationId },
    data:  {
      turns:       newTurns,
      turnsRegenAt: new Date(
        nation.turnsRegenAt.getTime() + elapsed * TURNS.REGEN_INTERVAL_MS,
      ),
    },
  });

  return newTurns;
}

/**
 * Deducts turns for an action. Throws if not enough turns.
 */
export async function spendTurns(nationId: string, cost: number): Promise<void> {
  const current = await syncTurns(nationId);
  if (current < cost) {
    const nextRegen = new Date(Date.now() + TURNS.REGEN_INTERVAL_MS);
    throw new Error(
      `Not enough turns (${current}/${cost}). Next turn at ${nextRegen.toLocaleTimeString()}.`,
    );
  }
  await prisma.nation.update({
    where: { id: nationId },
    data:  { turns: { decrement: cost } },
  });
}

/** Minutes until next turn regeneration */
export function minutesToNextTurn(regenAt: Date): number {
  const msSinceLast = Date.now() - regenAt.getTime();
  const msUntilNext = TURNS.REGEN_INTERVAL_MS - (msSinceLast % TURNS.REGEN_INTERVAL_MS);
  return Math.ceil(msUntilNext / 60_000);
}
