import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { resolveInstant, persistBattleResult } from "@/server/game-engine/combat";
import { spendTurns, syncTurns } from "@/server/game-engine/turns";
import { TURNS } from "@/lib/game-constants";

const Schema = z.object({ targetNationId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { targetNationId } = parsed.data;

  const attackerNation = await prisma.nation.findUnique({
    where:   { playerId: session.user.id },
    include: {
      resource:  true,
      morale:    true,
      buildings: true,
      armies:    { include: { units: { include: { unitType: true } } } },
    },
  });

  if (!attackerNation) return NextResponse.json({ error: "No nation" }, { status: 404 });
  if (attackerNation.id === targetNationId) return NextResponse.json({ error: "Cannot attack yourself" }, { status: 400 });
  if (attackerNation.status === "PROTECTED") return NextResponse.json({ error: "You are under protection" }, { status: 403 });

  // Sync and check turns
  await syncTurns(attackerNation.id);
  const refreshed = await prisma.nation.findUniqueOrThrow({
    where: { id: attackerNation.id }, select: { turns: true },
  });
  if (refreshed.turns < TURNS.ATTACK_COST) {
    return NextResponse.json({ error: `Not enough turns (need ${TURNS.ATTACK_COST})` }, { status: 400 });
  }

  const defenderNation = await prisma.nation.findUnique({
    where:   { id: targetNationId },
    include: {
      resource:  true,
      morale:    true,
      buildings: true,
      armies:    { include: { units: { include: { unitType: true } } } },
    },
  });
  if (!defenderNation) return NextResponse.json({ error: "Target not found" }, { status: 404 });
  if (defenderNation.status === "PROTECTED") return NextResponse.json({ error: "Target is under protection" }, { status: 403 });

  const atkUnits = attackerNation.armies.reduce(
    (sum, a) => sum + a.units.reduce((s, u) => s + u.quantity, 0), 0,
  );
  if (atkUnits === 0) return NextResponse.json({ error: "You have no units to attack with" }, { status: 400 });

  // ── Instant resolution ───────────────────────────────────────────────────
  const result = resolveInstant(attackerNation, defenderNation);

  // Deduct turns + persist battle atomically
  await spendTurns(attackerNation.id, TURNS.ATTACK_COST);
  const battleId = await persistBattleResult(
    attackerNation.id, defenderNation.id, result, TURNS.ATTACK_COST,
  );

  // Notify defender
  await prisma.notification.create({
    data: {
      nationId: defenderNation.id,
      type:     "BATTLE_RESOLVED",
      payload:  {
        from:       attackerNation.name,
        winner:     result.winner,
        battleId,
        summary:    result.summary,
      },
    },
  });

  return NextResponse.json({
    success:  true,
    battleId,
    winner:   result.winner,
    summary:  result.summary,
    landGained:  result.winner === "ATTACKER" ? result.landGained  : 0,
    moneyStolen: result.winner === "ATTACKER" ? result.moneyStolen : 0,
    attackerLost: result.attackerLost,
    defenderLost: result.defenderLost,
  });
}
