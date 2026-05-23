import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { resolveInstant, persistBattleResult } from "@/server/game-engine/combat";
import { spendTurns, syncTurns } from "@/server/game-engine/turns";
import { TURNS, ECONOMY } from "@/lib/game-constants";

const Schema = z.object({
  targetNationId: z.string().min(1),
  // Client must send this flag to confirm they acknowledge losing protection
  acknowledgeProtectionLoss: z.boolean().optional(),
});

function protectionExpired(createdAt: Date): boolean {
  return Date.now() > createdAt.getTime() + ECONOMY.PROTECTION_HOURS * 3_600_000;
}

async function liftProtectionIfExpired(nationId: string, createdAt: Date) {
  if (protectionExpired(createdAt)) {
    await prisma.nation.update({ where: { id: nationId }, data: { status: "ACTIVE" } });
    return true;
  }
  return false;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { targetNationId, acknowledgeProtectionLoss = false } = parsed.data;

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
  if (attackerNation.status === "DESTROYED") return NextResponse.json({ error: "Your nation is destroyed" }, { status: 403 });

  // Handle attacker protection
  let attackerLostProtection = false;
  if (attackerNation.status === "PROTECTED") {
    if (protectionExpired(attackerNation.createdAt)) {
      // Silently expire
      await liftProtectionIfExpired(attackerNation.id, attackerNation.createdAt);
    } else {
      // Still within protection window — require explicit acknowledgement
      if (!acknowledgeProtectionLoss) {
        const expiresAt = new Date(attackerNation.createdAt.getTime() + ECONOMY.PROTECTION_HOURS * 3_600_000);
        return NextResponse.json({
          error:             "PROTECTION_ACTIVE",
          expiresAt:         expiresAt.toISOString(),
          requiresConfirm:   true,
        }, { status: 403 });
      }
      // Acknowledged — strip protection before proceeding
      await prisma.nation.update({ where: { id: attackerNation.id }, data: { status: "ACTIVE" } });
      attackerNation.status = "ACTIVE";
      attackerLostProtection = true;
    }
  }

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

  // Auto-expire defender protection if their time is up
  if (defenderNation.status === "PROTECTED") {
    const expired = await liftProtectionIfExpired(defenderNation.id, defenderNation.createdAt);
    if (!expired) {
      return NextResponse.json({ error: "Target nation is under protection" }, { status: 403 });
    }
    defenderNation.status = "ACTIVE";
  }

  const atkUnits = attackerNation.armies.reduce(
    (sum, a) => sum + a.units.reduce((s, u) => s + u.quantity, 0), 0,
  );
  if (atkUnits === 0) return NextResponse.json({ error: "You have no units to attack with" }, { status: 400 });

  // ── Instant resolution ───────────────────────────────────────────────────
  const result = resolveInstant(attackerNation, defenderNation);

  await spendTurns(attackerNation.id, TURNS.ATTACK_COST);
  const battleId = await persistBattleResult(
    attackerNation.id, defenderNation.id, result, TURNS.ATTACK_COST,
  );

  await prisma.notification.create({
    data: {
      nationId: defenderNation.id,
      type:     "BATTLE_RESOLVED",
      payload:  { from: attackerNation.name, winner: result.winner, battleId, summary: result.summary },
    },
  });

  return NextResponse.json({
    success:              true,
    battleId,
    winner:               result.winner,
    summary:              result.summary,
    landGained:           result.winner === "ATTACKER" ? result.landGained  : 0,
    moneyStolen:          result.winner === "ATTACKER" ? result.moneyStolen : 0,
    attackerLost:         result.attackerLost,
    defenderLost:         result.defenderLost,
    attackerLostProtection,
  });
}
