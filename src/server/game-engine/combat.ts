import { COMBAT, MORALE } from "@/lib/game-constants";
import { prisma } from "@/lib/db";
import type { Nation, Resource, MoraleRecord, Unit, UnitType, Building } from "@prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────

export interface CombatNation {
  id:       string;
  name:     string;
  resource: Pick<Resource, "money" | "land" | "population" | "energy"> | null;
  morale:   Pick<MoraleRecord, "morale"> | null;
  armies:   Array<{
    units: Array<{ quantity: number; unitType: UnitType }>;
  }>;
  buildings: Building[];
}

export interface BattleResult {
  winner:            "ATTACKER" | "DEFENDER";
  attackerPower:     number;
  defenderPower:     number;
  variance:          number;
  attackerLost:      number;
  defenderLost:      number;
  landGained:        number;
  moneyStolen:       number;
  attackerMoraleDelta: number;
  defenderMoraleDelta: number;
  seed:              number;
  summary:           string;
}

// ── Seeded RNG (Mulberry32) ────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z = z + Math.imul(z ^ (z >>> 7), 61 | z) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSeed(attackerId: string, defenderId: string): number {
  const str = `${attackerId}:${defenderId}:${Math.floor(Date.now() / 1000)}`;
  let h = 0;
  for (const c of str) {
    h = Math.imul(31, h) + c.charCodeAt(0) | 0;
  }
  return Math.abs(h);
}

// ── Power calculation ──────────────────────────────────────────────────────

function calcAttackPower(nation: CombatNation): number {
  const moraleMult = 0.6 + ((nation.morale?.morale ?? 75) / 100) * 0.8;

  // Building bonuses
  const warFactory  = nation.buildings.find((b) => b.type === "WAR_FACTORY")?.count  ?? 0;
  const airfield    = nation.buildings.find((b) => b.type === "AIRFIELD")?.count    ?? 0;
  const shipyard    = nation.buildings.find((b) => b.type === "SHIPYARD")?.count    ?? 0;
  const buildingBonus = (cat: string) => {
    if (cat === "GROUND")   return 1 + warFactory * 0.05;
    if (cat === "AIR")      return 1 + airfield   * 0.05;
    if (cat === "SEA")      return 1 + shipyard   * 0.05;
    return 1;
  };

  let power = 0;
  for (const army of nation.armies) {
    for (const unit of army.units) {
      if (unit.quantity <= 0) continue;
      const catBonus = buildingBonus(unit.unitType.category);
      power += unit.quantity * unit.unitType.attack * catBonus;
    }
  }

  return Math.floor(power * moraleMult);
}

function calcDefensePower(nation: CombatNation): number {
  const moraleMult = 0.6 + ((nation.morale?.morale ?? 75) / 100) * 0.8;
  const towers     = nation.buildings.find((b) => b.type === "DEFENSE_TOWERS")?.count ?? 0;
  const towerBonus = 1 + towers * 0.08;

  let power = 0;
  for (const army of nation.armies) {
    for (const unit of army.units) {
      if (unit.quantity <= 0) continue;
      power += unit.quantity * unit.unitType.defense;
    }
  }

  return Math.floor(power * moraleMult * towerBonus);
}

function totalUnits(nation: CombatNation): number {
  return nation.armies.reduce(
    (sum, a) => sum + a.units.reduce((s, u) => s + u.quantity, 0),
    0,
  );
}

// ── Main resolver ──────────────────────────────────────────────────────────

export function resolveInstant(
  attacker: CombatNation,
  defender: CombatNation,
): BattleResult {
  const seed    = makeSeed(attacker.id, defender.id);
  const rng     = mulberry32(seed);

  const atkPower  = calcAttackPower(attacker);
  const defPower  = calcDefensePower(defender);
  const variance  = COMBAT.VARIANCE_MIN + rng() * (COMBAT.VARIANCE_MAX - COMBAT.VARIANCE_MIN);
  const effective = atkPower * variance;

  const attackerWins = effective > defPower;
  const atkTotal     = totalUnits(attacker);
  const defTotal     = totalUnits(defender);

  let landGained   = 0;
  let moneyStolen  = 0;
  let atkLost      = 0;
  let defLost      = 0;
  let atkMorale    = 0;
  let defMorale    = 0;

  if (attackerWins) {
    atkLost     = Math.ceil(atkTotal * COMBAT.ATTACKER_LOSS_PCT);
    defLost     = Math.ceil(defTotal * COMBAT.DEFENDER_LOSS_PCT);
    landGained  = Math.max(1, Math.floor((defender.resource?.land ?? 0) * COMBAT.LAND_STEAL_PCT));
    moneyStolen = Math.floor((defender.resource?.money ?? 0) * COMBAT.MONEY_STEAL_PCT);
    atkMorale   = MORALE.WIN_ATTACK;
    defMorale   = MORALE.LOSE_ATTACK;
  } else {
    atkLost   = Math.ceil(atkTotal * COMBAT.ATTACKER_LOSS_PCT_DEFEAT);
    defLost   = Math.ceil(defTotal * COMBAT.DEFENDER_LOSS_PCT_DEFEAT);
    atkMorale = MORALE.LOSE_ATTACK;
    defMorale = MORALE.WIN_ATTACK;
  }

  const winner = attackerWins ? "ATTACKER" : "DEFENDER";
  const summary = attackerWins
    ? `${attacker.name} overpowered ${defender.name} (${Math.round(effective)} vs ${defPower}). Seized ${landGained} land and ${moneyStolen.toLocaleString()} money.`
    : `${defender.name} repelled ${attacker.name}'s attack (${Math.round(effective)} vs ${defPower}).`;

  return {
    winner, attackerPower: atkPower, defenderPower: defPower,
    variance, attackerLost: atkLost, defenderLost: defLost,
    landGained, moneyStolen, attackerMoraleDelta: atkMorale,
    defenderMoraleDelta: defMorale, seed, summary,
  };
}

// ── DB write after resolution ──────────────────────────────────────────────

export async function persistBattleResult(
  attackerNationId: string,
  defenderNationId: string,
  result: BattleResult,
  turnsCost: number,
): Promise<string> {
  const battle = await prisma.$transaction(async (tx) => {
    // 1. Create battle record
    const b = await tx.battle.create({
      data: {
        worldId:         "world_01",
        attackerNationId,
        defenderNationId,
        winner:      result.winner,
        status:      "RESOLVED",
        seed:        result.seed,
        landGained:  result.landGained,
        moneyStolen: result.moneyStolen,
        turnsCost,
      },
    });

    // 2. Transfer money
    if (result.moneyStolen > 0) {
      await tx.resource.update({
        where: { nationId: defenderNationId },
        data:  { money: { decrement: result.moneyStolen } },
      });
      await tx.resource.update({
        where: { nationId: attackerNationId },
        data:  { money: { increment: result.moneyStolen } },
      });
    }

    // 3. Transfer land
    if (result.landGained > 0) {
      await tx.resource.update({
        where: { nationId: defenderNationId },
        data:  { land: { decrement: result.landGained } },
      });
      await tx.resource.update({
        where: { nationId: attackerNationId },
        data:  { land: { increment: result.landGained } },
      });
    }

    // 4. Apply morale changes
    await tx.moraleRecord.update({
      where: { nationId: attackerNationId },
      data:  { morale: { increment: result.attackerMoraleDelta } },
    });
    await tx.moraleRecord.update({
      where: { nationId: defenderNationId },
      data:  { morale: { increment: result.defenderMoraleDelta } },
    });

    // 5. Store report
    await tx.battleReport.create({
      data: {
        battleId: b.id,
        payload:  JSON.parse(JSON.stringify(result)),
      },
    });

    return b;
  });

  return battle.id;
}
