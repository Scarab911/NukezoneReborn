import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { BUILDINGS, TURNS } from "@/lib/game-constants";
import { spendTurns } from "@/server/game-engine/turns";
import type { BuildingType } from "@prisma/client";

const BuildSchema = z.object({
  type:  z.enum(["WAR_FACTORY","AIRFIELD","SHIPYARD","RESEARCH_LAB","POWER_PLANT","MISSILE_SILO","DEFENSE_TOWERS"]),
  count: z.number().int().min(1).max(5),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const nation = await prisma.nation.findUnique({
    where:   { playerId: session.user.id },
    include: { resource: true, buildings: true },
  });
  if (!nation) return NextResponse.json({ error: "No nation" }, { status: 404 });

  return NextResponse.json({
    money:     nation.resource?.money  ?? 0,
    land:      nation.resource?.land   ?? 0,
    buildings: nation.buildings,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await req.json();
  const parsed = BuildSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { type, count } = parsed.data;

  const nation = await prisma.nation.findUnique({
    where:   { playerId: session.user.id },
    include: { resource: true, buildings: true },
  });
  if (!nation) return NextResponse.json({ error: "No nation" }, { status: 404 });

  const existing = nation.buildings.find((b) => b.type === type);
  const currentCount = existing?.count ?? 0;
  if (currentCount + count > BUILDINGS.MAX_PER_TYPE) {
    return NextResponse.json({ error: `Max ${BUILDINGS.MAX_PER_TYPE} of any building type` }, { status: 400 });
  }

  const totalCost  = BUILDINGS.MONEY_COST[type] * count;
  const landNeeded = BUILDINGS.LAND_PER_BUILDING * count;

  if ((nation.resource?.money ?? 0) < totalCost) {
    return NextResponse.json({ error: `Need ${totalCost.toLocaleString()} money` }, { status: 400 });
  }
  if ((nation.resource?.land ?? 0) < landNeeded) {
    return NextResponse.json({ error: `Need ${landNeeded} land` }, { status: 400 });
  }

  const turnCost = TURNS.BUILD_COST * count;
  await spendTurns(nation.id, turnCost);

  await prisma.$transaction([
    prisma.resource.update({
      where: { nationId: nation.id },
      data:  { money: { decrement: totalCost }, land: { decrement: landNeeded } },
    }),
    existing
      ? prisma.building.update({ where: { id: existing.id }, data: { count: { increment: count } } })
      : prisma.building.create({ data: { nationId: nation.id, type: type as BuildingType, count } }),
  ]);

  return NextResponse.json({ success: true }, { status: 201 });
}
