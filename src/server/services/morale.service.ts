import { prisma } from "@/lib/db";
import { MORALE } from "@/lib/game-constants";

export async function getMorale(nationId: string): Promise<number> {
  const record = await prisma.moraleRecord.findUnique({ where: { nationId } });
  return record?.morale ?? 75;
}

export async function applyMoraleDelta(nationId: string, delta: number): Promise<number> {
  const record = await prisma.moraleRecord.update({
    where: { nationId },
    data:  { morale: { increment: delta } },
  });

  // Clamp to [0, 100]
  const clamped = Math.max(0, Math.min(100, record.morale));
  if (clamped !== record.morale) {
    await prisma.moraleRecord.update({
      where: { nationId },
      data:  { morale: clamped },
    });
    return clamped;
  }
  return record.morale;
}

export async function applyMoraleEvent(
  nationId: string,
  event: keyof typeof MORALE,
): Promise<number> {
  const delta = MORALE[event];
  return applyMoraleDelta(nationId, delta);
}

// Called each economy tick for passive regeneration
export async function regenerateMorale(nationId: string, isAtPeace: boolean): Promise<void> {
  const delta = MORALE.REGEN_BASE + (isAtPeace ? MORALE.REGEN_PEACE_BONUS : 0);
  await applyMoraleDelta(nationId, delta);
}
