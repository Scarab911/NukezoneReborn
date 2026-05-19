import { prisma } from "@/lib/db";
import type { Resource } from "@prisma/client";

export async function getResources(nationId: string): Promise<Resource | null> {
  return prisma.resource.findUnique({ where: { nationId } });
}

export async function applyResourceDelta(
  nationId: string,
  delta: Partial<Pick<Resource, "money" | "land" | "population" | "energy">>,
): Promise<Resource> {
  const data: Record<string, unknown> = {};
  if (delta.money      !== undefined) data.money      = { increment: delta.money };
  if (delta.land       !== undefined) data.land       = { increment: delta.land };
  if (delta.population !== undefined) data.population = { increment: delta.population };
  if (delta.energy     !== undefined) data.energy     = { increment: delta.energy };
  return prisma.resource.update({ where: { nationId }, data });
}

export async function deductMoney(nationId: string, amount: number): Promise<Resource> {
  const resource = await prisma.resource.findUniqueOrThrow({ where: { nationId } });
  if (resource.money < amount) throw new Error("Insufficient money");
  return prisma.resource.update({ where: { nationId }, data: { money: { decrement: amount } } });
}

export async function transferMoney(
  fromNationId: string,
  toNationId:   string,
  amount:       number,
  note?:        string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const sender = await tx.resource.findUniqueOrThrow({ where: { nationId: fromNationId } });
    if (sender.money < amount) throw new Error("Insufficient money");
    await tx.resource.update({ where: { nationId: fromNationId }, data: { money: { decrement: amount } } });
    await tx.resource.update({ where: { nationId: toNationId },   data: { money: { increment: amount } } });
    await tx.transaction.create({
      data: { type: "TRANSFER", fromId: fromNationId, toId: toNationId, amount, note },
    });
  });
}
