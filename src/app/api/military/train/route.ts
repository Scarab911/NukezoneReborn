import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const TrainSchema = z.object({
  unitTypeId: z.string().min(1),
  quantity:   z.number().int().min(1).max(9999),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await req.json();
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

  if (!nation)   return NextResponse.json({ error: "No nation"    }, { status: 404 });
  if (!unitType) return NextResponse.json({ error: "Unknown unit" }, { status: 404 });

  if (unitType.requiresTech) {
    const hasResearch = await prisma.researchProgress.findFirst({
      where: { nationId: nation.id, techNode: { slug: unitType.requiresTech }, status: "COMPLETED" },
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

  await prisma.$transaction([
    prisma.resource.update({
      where: { nationId: nation.id },
      data:  { money: { decrement: totalCost } },
    }),
    // Upsert unit into army
    prisma.unit.upsert({
      where:  { armyId_unitTypeId: { armyId: army.id, unitTypeId } },
      update: { quantity: { increment: quantity } },
      create: { armyId: army.id, unitTypeId, quantity },
    }),
    prisma.nation.update({
      where: { id: nation.id },
      data:  { totalUnits: { increment: quantity } },
    }),
  ]);

  return NextResponse.json({ success: true }, { status: 201 });
}
