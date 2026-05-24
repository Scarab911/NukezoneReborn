// Economy tick — called on dashboard load (and eventually by BullMQ cron).
// Calculates income since last tick and applies it to the calling nation.
// Idempotent: re-running within the same tick window is safe (no double-credit).

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ECONOMY, MORALE } from "@/lib/game-constants";

const TICK_INTERVAL_MS = 30_000;

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const nation = await prisma.nation.findUnique({
      where:   { playerId: session.user.id },
      include: { resource: true, morale: true },
    });
    if (!nation || nation.status === "DESTROYED") return NextResponse.json({ ticks: 0 });
    if (!nation.resource) return NextResponse.json({ ticks: 0 });

    const lastTick    = nation.resource.updatedAt;
    const msSinceLast = Date.now() - lastTick.getTime();
    const ticks       = Math.floor(msSinceLast / TICK_INTERVAL_MS);

    if (ticks === 0) return NextResponse.json({ ticks: 0, income: 0, upkeep: 0 });

    const moraleMultiplier = 0.5 + ((nation.morale?.morale ?? 75) / 100) * 0.8;
    const land = nation.resource.land;

    const incomePerTick = Math.floor(land * ECONOMY.BASE_INCOME_PER_LAND * moraleMultiplier);
    const upkeepPerTick = Math.floor(nation.totalUnits * ECONOMY.UPKEEP_PER_UNIT);
    const netPerTick    = incomePerTick - upkeepPerTick;
    const totalNet      = netPerTick * ticks;
    const moraleDelta   = ticks * MORALE.REGEN_BASE;

    await prisma.$transaction([
      prisma.resource.update({
        where: { nationId: nation.id },
        data:  { money: { increment: totalNet } },
      }),
      // upsert — safe even if the morale row was never created
      prisma.moraleRecord.upsert({
        where:  { nationId: nation.id },
        update: { morale: { increment: moraleDelta } },
        create: { nationId: nation.id, morale: Math.min(100, ECONOMY.STARTING_MORALE + moraleDelta) },
      }),
    ]);

    return NextResponse.json({ ticks, incomePerTick, upkeepPerTick, netPerTick, totalNet, moraleDelta });
  } catch (err) {
    console.error("[tick/economy]", err);
    return NextResponse.json({ ticks: 0, error: "Tick failed" });
  }
}
