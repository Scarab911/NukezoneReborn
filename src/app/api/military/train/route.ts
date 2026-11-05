import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { checkCanHouse, enforceHousing } from "@/server/services/housing.service";
import { finishedResearchWhere } from "@/server/services/tech.service";
import { powerState } from "@/lib/power";

const TrainSchema = z.object({
  unitTypeId: z.string().min(1),
  quantity:   z.number().int().min(1).max(9999),
});

/** Thrown inside the transaction to roll it back with a player-facing message. */
class TrainRejected extends Error {}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await req.json().catch(() => null);
  const parsed = TrainSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { unitTypeId, quantity } = parsed.data;

  const [nation, unitType] = await Promise.all([
    prisma.nation.findUnique({
      where:   { playerId: session.user.id },
      include: { resource: true },
    }),
    prisma.unitType.findUnique({ where: { id: unitTypeId } }),
  ]);

  if (!nation)   return NextResponse.json({ error: "No enclave"    }, { status: 404 });
  if (!unitType) return NextResponse.json({ error: "Unknown unit" }, { status: 404 });
  if (nation.status === "DESTROYED") return NextResponse.json({ error: "Enclave destroyed" }, { status: 403 });

  if (unitType.requiresTech) {
    const hasResearch = await prisma.researchProgress.findFirst({
      where: { ...finishedResearchWhere(nation.id), techNode: { slug: unitType.requiresTech } },
    });
    if (!hasResearch) return NextResponse.json({ error: `Requires: ${unitType.requiresTech}` }, { status: 403 });
  }

  const totalCost = unitType.moneyCost * quantity;
  if ((nation.resource?.money ?? 0) < totalCost) {
    return NextResponse.json({ error: "Not enough money" }, { status: 400 });
  }

  // Training completes instantly in turn-based mode (no time gate)
  const army = await prisma.army.findFirst({ where: { nationId: nation.id } });
  if (!army) return NextResponse.json({ error: "No army found" }, { status: 404 });

  try {
    await prisma.$transaction(async (tx) => {
      // Apply any expired desertion first, then check there's room
      await enforceHousing(tx, nation.id);

      // A power shortage (e.g. razed Power Plants) halts training
      const grid = powerState(await tx.building.findMany({
        where: { nationId: nation.id }, select: { type: true, count: true },
      }));
      if (grid.level < 1) {
        throw new TrainRejected(`Power shortage (${grid.supply}/${grid.draw}): build Power Plants to train again`);
      }
      const noRoom = await checkCanHouse(tx, nation.id, unitType.slug, quantity);
      if (noRoom) throw new TrainRejected(noRoom);

      const paid = await tx.resource.updateMany({
        where: { nationId: nation.id, money: { gte: totalCost } },
        data:  { money: { decrement: totalCost } },
      });
      if (paid.count === 0) throw new TrainRejected("Not enough money");

      await tx.unit.upsert({
        where:  { armyId_unitTypeId: { armyId: army.id, unitTypeId } },
        update: { quantity: { increment: quantity } },
        create: { armyId: army.id, unitTypeId, quantity },
      });
      await tx.nation.update({
        where: { id: nation.id },
        data:  { totalUnits: { increment: quantity } },
      });
    }, { timeout: 15_000 });
  } catch (err) {
    if (err instanceof TrainRejected) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
