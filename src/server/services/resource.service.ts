import { prisma } from "@/lib/db";
import type { Resource } from "@prisma/client";

export async function getResources(nationId: string): Promise<Resource | null> {
  return prisma.resource.findUnique({ where: { nationId } });
}

export async function applyResourceDelta(
  nationId: string,
  delta: Partial<Pick<Resource, "gold" | "food" | "steel" | "energy">>,
): Promise<Resource> {
  const data: Record<string, unknown> = {};
  if (delta.gold  !== undefined) data.gold  = { increment: delta.gold  };
  if (delta.food  !== undefined) data.food  = { increment: delta.food  };
  if (delta.steel !== undefined) data.steel = { increment: delta.steel };
  if (delta.energy!== undefined) data.energy= { increment: delta.energy};

  return prisma.resource.update({ where: { nationId }, data });
}

export async function deductGold(
  nationId: string,
  amount: number,
): Promise<Resource> {
  const resource = await prisma.resource.findUniqueOrThrow({ where: { nationId } });
  if (resource.gold < amount) throw new Error("Insufficient gold");
  return prisma.resource.update({
    where: { nationId },
    data:  { gold: { decrement: amount } },
  });
}

// Atomic transfer — used by market, loot, alliance treasury
export async function transferGold(
  fromNationId: string,
  toNationId: string,
  amount: number,
  note?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const sender = await tx.resource.findUniqueOrThrow({ where: { nationId: fromNationId } });
    if (sender.gold < amount) throw new Error("Insufficient gold");

    await tx.resource.update({ where: { nationId: fromNationId }, data: { gold: { decrement: amount } } });
    await tx.resource.update({ where: { nationId: toNationId },   data: { gold: { increment: amount } } });
    await tx.transaction.create({
      data: { type: "TRANSFER", fromId: fromNationId, toId: toNationId, amount, note },
    });
  });
}

export async function enforceStorageCaps(
  nationId: string,
  landCount: number,
  mineCount: number,
): Promise<void> {
  const caps = {
    gold:  10_000 + landCount  * 500,
    steel: 5_000  + mineCount  * 200,
    food:  2_000  + landCount  * 100,
  };

  const r = await prisma.resource.findUniqueOrThrow({ where: { nationId } });
  const data: Partial<Pick<Resource, "gold" | "steel" | "food">> = {};
  if (r.gold  > caps.gold)  data.gold  = caps.gold;
  if (r.steel > caps.steel) data.steel = caps.steel;
  if (r.food  > caps.food)  data.food  = caps.food;

  if (Object.keys(data).length > 0) {
    await prisma.resource.update({ where: { nationId }, data });
  }
}
