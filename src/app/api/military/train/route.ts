import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const TrainSchema = z.object({
  unitTypeId: z.string().min(1), // IDs are UUIDs from seed, not cuid format
  quantity:   z.number().int().min(1).max(9999),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await req.json();
  const parsed = TrainSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { unitTypeId, quantity } = parsed.data;

  const [nation, unitType] = await Promise.all([
    prisma.nation.findUnique({
      where:   { playerId: session.user.id },
      include: { resource: true },
    }),
    prisma.unitType.findUnique({ where: { id: unitTypeId } }),
  ]);

  if (!nation)    return NextResponse.json({ error: "No nation" },     { status: 404 });
  if (!unitType)  return NextResponse.json({ error: "Unknown unit" },  { status: 404 });

  // Tech requirement check
  if (unitType.requiresTech) {
    const hasResearch = await prisma.researchProgress.findFirst({
      where: { nationId: nation.id, techNode: { slug: unitType.requiresTech }, status: "COMPLETED" },
    });
    if (!hasResearch) {
      return NextResponse.json({ error: `Requires research: ${unitType.requiresTech}` }, { status: 403 });
    }
  }

  const totalGold  = unitType.goldCost  * quantity;
  const totalSteel = unitType.steelCost * quantity;

  if ((nation.resource?.gold  ?? 0) < totalGold)  return NextResponse.json({ error: "Not enough gold"  }, { status: 400 });
  if ((nation.resource?.steel ?? 0) < totalSteel) return NextResponse.json({ error: "Not enough steel" }, { status: 400 });

  const completesAt = new Date(
    Date.now() + unitType.trainTimeSec * 1000 * quantity,
  );

  await prisma.$transaction([
    prisma.resource.update({
      where: { nationId: nation.id },
      data:  { gold: { decrement: totalGold }, steel: { decrement: totalSteel } },
    }),
    prisma.unitTraining.create({
      data: { nationId: nation.id, unitTypeId, quantity, completesAt },
    }),
    prisma.transaction.create({
      data: {
        type:   "TRAINING_COST",
        fromId: nation.id,
        amount: totalGold,
        note:   `Train ${quantity}× ${unitType.name}`,
      },
    }),
  ]);

  return NextResponse.json({ success: true, completesAt }, { status: 201 });
}
