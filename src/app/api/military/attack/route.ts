import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { resolveInstant, persistBattleResult } from "@/server/game-engine/combat";
import { spendTurns, syncTurns } from "@/server/game-engine/turns";
import { TURNS } from "@/lib/game-constants";
import { calcNetworth, rangeStatus, totalLand } from "@/lib/networth";
import {
  liftProtectionIfExpired, protectionExpired, removeProtection,
} from "@/server/services/protection.service";
import { enforceHousing } from "@/server/services/housing.service";
import { getTechBonuses } from "@/server/services/tech.service";

const Schema = z.object({
  targetNationId: z.string().min(1),
  // Client must send this flag to confirm they acknowledge losing protection
  acknowledgeProtectionLoss: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { targetNationId, acknowledgeProtectionLoss = false } = parsed.data;

  // Apply any expired desertion on both sides first, so units that have left
  // (e.g. an offline defender's) never fight
  const [me, target] = await Promise.all([
    prisma.nation.findUnique({ where: { playerId: session.user.id }, select: { id: true, status: true } }),
    prisma.nation.findUnique({ where: { id: targetNationId },        select: { id: true, status: true } }),
  ]);
  if (me && target && me.id !== target.id && me.status !== "DESTROYED" && target.status !== "DESTROYED") {
    await prisma.$transaction(async (tx) => {
      await enforceHousing(tx, me.id);
      await enforceHousing(tx, target.id);
    }, { timeout: 15_000 });
  }

  const attackerNation = await prisma.nation.findUnique({
    where:   { playerId: session.user.id },
    include: {
      resource:  true,
      morale:    true,
      buildings: true,
      armies:    { include: { units: { include: { unitType: true } } } },
    },
  });

  if (!attackerNation) return NextResponse.json({ error: "No enclave" }, { status: 404 });
  if (attackerNation.id === targetNationId) return NextResponse.json({ error: "Cannot attack yourself" }, { status: 400 });
  if (attackerNation.status === "DESTROYED") return NextResponse.json({ error: "Your enclave is destroyed" }, { status: 403 });

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
  if (!defenderNation || defenderNation.status === "DESTROYED") {
    return NextResponse.json({ error: "Target not found" }, { status: 404 });
  }

  // Networth range — both sides must be within reach of each other
  const networthOf = (n: typeof attackerNation) => calcNetworth({
    totalUnits: n.totalUnits,
    land:       totalLand(n.resource?.land ?? 0, n.buildings.reduce((s, b) => s + b.count, 0)),
  });
  const range = rangeStatus(networthOf(attackerNation), networthOf(defenderNation));
  if (range !== "IN_RANGE") {
    return NextResponse.json({
      error: range === "TOO_WEAK"
        ? "Target is out of range: too weak for you to attack"
        : "Target is out of range: too strong for you to attack",
    }, { status: 403 });
  }

  // Auto-expire defender protection if their time is up
  if (defenderNation.status === "PROTECTED") {
    const expired = await liftProtectionIfExpired(defenderNation.id, defenderNation.protectedUntil);
    if (!expired) {
      return NextResponse.json({ error: "Target enclave is under protection" }, { status: 403 });
    }
    defenderNation.status = "ACTIVE";
  }

  const atkUnits = attackerNation.armies.reduce(
    (sum, a) => sum + a.units.reduce((s, u) => s + u.quantity, 0), 0,
  );
  if (atkUnits === 0) return NextResponse.json({ error: "You have no units to attack with" }, { status: 400 });

  // Attacker protection — checked last so a rejected attack never costs the shield
  let attackerLostProtection = false;
  if (attackerNation.status === "PROTECTED") {
    if (protectionExpired(attackerNation.protectedUntil)) {
      await liftProtectionIfExpired(attackerNation.id, attackerNation.protectedUntil);
    } else {
      // Still shielded — require explicit acknowledgement
      if (!acknowledgeProtectionLoss) {
        return NextResponse.json({
          error:           "PROTECTION_ACTIVE",
          expiresAt:       attackerNation.protectedUntil?.toISOString() ?? null,
          requiresConfirm: true,
        }, { status: 403 });
      }
      await removeProtection(attackerNation.id);
      attackerLostProtection = true;
    }
  }

  // ── Instant resolution ───────────────────────────────────────────────────
  const [attackerTech, defenderTech] = await Promise.all([
    getTechBonuses(prisma, attackerNation.id),
    getTechBonuses(prisma, defenderNation.id),
  ]);
  const result = resolveInstant(attackerNation, defenderNation, { attacker: attackerTech, defender: defenderTech });

  await spendTurns(attackerNation.id, TURNS.ATTACK_COST);
  const { battleId, landGained, buildingsDestroyed, summary, defenderShieldUntil, defenderOverflow } = await persistBattleResult(
    attackerNation.id, defenderNation.id, defenderNation.name, result, TURNS.ATTACK_COST,
  );

  await prisma.notification.create({
    data: {
      nationId: defenderNation.id,
      type:     "BATTLE_RESOLVED",
      payload:  {
        from: attackerNation.name, winner: result.winner, battleId, summary, buildingsDestroyed,
        // Defender was ruined down to the land floor and is shielded until this time
        shieldUntil: defenderShieldUntil?.toISOString() ?? null,
        // Housing types left over capacity → when the excess units desert
        overflowDeadlines: Object.fromEntries(
          Object.entries(defenderOverflow).map(([type, d]) => [type, d.toISOString()]),
        ),
      },
    },
  });

  return NextResponse.json({
    success:              true,
    battleId,
    winner:               result.winner,
    summary,
    landGained,
    buildingsDestroyed,
    moneyStolen:          result.winner === "ATTACKER" ? result.moneyStolen : 0,
    attackerLost:         result.attackerLost,
    defenderLost:         result.defenderLost,
    attackerLostProtection,
    defenderShielded:     defenderShieldUntil !== null,
  });
}
