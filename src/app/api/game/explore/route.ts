import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { spendTurns } from "@/server/game-engine/turns";
import { EXPLORE, ECONOMY } from "@/lib/game-constants";

export function calcExplore(explorationCount: number): { turnCost: number; landGained: number } {
  const turnCost  = EXPLORE.BASE_COST + Math.floor(explorationCount / EXPLORE.COST_STEP);
  const landGained = Math.max(
    EXPLORE.MIN_LAND,
    Math.floor(EXPLORE.BASE_LAND * Math.pow(EXPLORE.LAND_DECAY, explorationCount)),
  );
  return { turnCost, landGained };
}

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const nation = await prisma.nation.findUnique({
      where:   { playerId: session.user.id },
      include: { resource: true },
    });
    if (!nation)            return NextResponse.json({ error: "No nation" }, { status: 404 });
    if (!nation.resource)   return NextResponse.json({ error: "Nation has no resources" }, { status: 500 });
    if (nation.status === "DESTROYED") return NextResponse.json({ error: "Nation destroyed" }, { status: 403 });

    const currentLand = nation.resource.land;
    if (currentLand >= ECONOMY.LAND_MAX) {
      return NextResponse.json({ error: "Land cap reached" }, { status: 400 });
    }

    const explorationCount = nation.explorationCount ?? 0;
    const { turnCost, landGained } = calcExplore(explorationCount);

    try {
      await spendTurns(nation.id, turnCost);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Not enough turns";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const actualGain = Math.min(landGained, ECONOMY.LAND_MAX - currentLand);

    await prisma.$transaction([
      prisma.resource.update({
        where: { nationId: nation.id },
        data:  { land: { increment: actualGain } },
      }),
      prisma.nation.update({
        where: { id: nation.id },
        data:  { explorationCount: { increment: 1 } },
      }),
    ]);

    const next = calcExplore(explorationCount + 1);

    return NextResponse.json({
      landGained: actualGain,
      turnCost,
      explorationCount: explorationCount + 1,
      next,
    });
  } catch (err) {
    console.error("[explore POST]", err);
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Preview endpoint — returns cost/land for current count without mutating
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const nation = await prisma.nation.findUnique({
    where:  { playerId: session.user.id },
    select: { explorationCount: true, resource: { select: { land: true } } },
  });
  if (!nation) return NextResponse.json({ error: "No nation" }, { status: 404 });

  const { turnCost, landGained } = calcExplore(nation.explorationCount);
  return NextResponse.json({
    turnCost,
    landGained,
    explorationCount: nation.explorationCount,
    landCap: ECONOMY.LAND_MAX,
    currentLand: nation.resource?.land ?? 0,
  });
}
