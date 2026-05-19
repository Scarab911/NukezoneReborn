import { prisma } from "@/lib/db";
import type { Nation, Resource, MoraleRecord } from "@prisma/client";

export type NationSnapshot = Nation & {
  resource:  Resource | null;
  morale:    MoraleRecord | null;
};

export async function getNationByPlayerId(playerId: string): Promise<NationSnapshot | null> {
  return prisma.nation.findUnique({
    where: { playerId },
    include: { resource: true, morale: true },
  });
}

export async function getNationById(nationId: string): Promise<NationSnapshot | null> {
  return prisma.nation.findUnique({
    where: { id: nationId },
    include: { resource: true, morale: true },
  });
}

export async function getNationsByWorld(worldId: string): Promise<NationSnapshot[]> {
  return prisma.nation.findMany({
    where: { worldId, status: { in: ["ACTIVE", "PROTECTED"] } },
    include: { resource: true, morale: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function setNationStatus(
  nationId: string,
  status: Nation["status"],
): Promise<void> {
  await prisma.nation.update({ where: { id: nationId }, data: { status } });
}

export async function decrementUnits(nationId: string, count: number): Promise<Nation> {
  return prisma.nation.update({
    where: { id: nationId },
    data: { totalUnits: { decrement: Math.max(0, count) } },
  });
}
