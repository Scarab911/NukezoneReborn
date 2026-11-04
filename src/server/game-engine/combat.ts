import { BUILDINGS, COMBAT, MORALE } from "@/lib/game-constants";
import { prisma } from "@/lib/db";
import { planLandSeizure, totalLand } from "@/lib/networth";
import { grantRuinShield } from "@/server/services/protection.service";
import { syncOverflowDeadlines, type OverflowDeadlines } from "@/server/services/housing.service";
import type { Resource, MoraleRecord, UnitType, Building, Prisma } from "@prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────

export interface CombatNation {
  id:       string;
  name:     string;
  resource: Pick<Resource, "money" | "land" | "energy"> | null;
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
  /** Filled in by persistBattleResult (computed from fresh data inside the transaction). */
  landGained:        number;
  /** Filled in by persistBattleResult. */
  buildingsDestroyed: number;
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

// ── Category counter multipliers ──────────────────────────────────────────
// attacker category → defender category → damage bonus (additive fraction)
// e.g. AIR vs GROUND: air units deal 30% more damage to ground forces
const COUNTER_BONUS: Partial<Record<string, Partial<Record<string, number>>>> = {
  AIR:      { GROUND: 0.30 },  // gunships/jets punish ground formations
  SEA:      { AIR:    0.25 },  // naval AA shreds aircraft
  GROUND:   { SEA:    0.15 },  // coastal assault advantage
  SPECIAL:  { GROUND: 0.20 },  // spec-ops are highly effective vs infantry
};

function categoryCounts(nation: CombatNation): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const army of nation.armies) {
    for (const unit of army.units) {
      if (unit.quantity > 0) {
        counts[unit.unitType.category] = (counts[unit.unitType.category] ?? 0) + unit.quantity;
      }
    }
  }
  return counts;
}

function counterMultiplierFor(attackerCat: string, defCounts: Record<string, number>): number {
  const bonuses = COUNTER_BONUS[attackerCat];
  if (!bonuses) return 1;
  const total = Object.values(defCounts).reduce((a, b) => a + b, 0);
  if (total === 0) return 1;
  let extra = 0;
  for (const [defCat, bonus] of Object.entries(bonuses)) {
    if (bonus === undefined) continue;
    extra += bonus * ((defCounts[defCat] ?? 0) / total);
  }
  return 1 + extra;
}

// ── Power calculation ──────────────────────────────────────────────────────

function calcAttackPower(nation: CombatNation, defenderCounts: Record<string, number>): number {
  const moraleMult = 0.6 + ((nation.morale?.morale ?? 75) / 100) * 0.8;

  let power = 0;
  for (const army of nation.armies) {
    for (const unit of army.units) {
      if (unit.quantity <= 0) continue;
      const counterMult = counterMultiplierFor(unit.unitType.category, defenderCounts);
      power += unit.quantity * unit.unitType.attack * counterMult;
    }
  }

  return Math.floor(power * moraleMult);
}

function calcDefensePower(nation: CombatNation, attackerCounts: Record<string, number>): number {
  const moraleMult = 0.6 + ((nation.morale?.morale ?? 75) / 100) * 0.8;
  const towers     = nation.buildings.find((b) => b.type === "DEFENSE_TOWERS")?.count ?? 0;
  const towerBonus = 1 + towers * BUILDINGS.DEFENSE_TOWER_BONUS;

  let power = 0;
  for (const army of nation.armies) {
    for (const unit of army.units) {
      if (unit.quantity <= 0) continue;
      // Defender units that counter the attacker's composition get a defensive bonus
      const counterMult = counterMultiplierFor(unit.unitType.category, attackerCounts);
      power += unit.quantity * unit.unitType.defense * counterMult;
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

  const defCounts = categoryCounts(defender);
  const atkCounts = categoryCounts(attacker);
  const atkPower  = calcAttackPower(attacker, defCounts);
  const defPower  = calcDefensePower(defender, atkCounts);
  const variance  = COMBAT.VARIANCE_MIN + rng() * (COMBAT.VARIANCE_MAX - COMBAT.VARIANCE_MIN);
  const effective = atkPower * variance;

  const attackerWins = effective > defPower;
  const atkTotal     = totalUnits(attacker);
  const defTotal     = totalUnits(defender);

  let moneyStolen  = 0;
  let atkLost      = 0;
  let defLost      = 0;
  let atkMorale    = 0;
  let defMorale    = 0;

  if (attackerWins) {
    atkLost     = Math.ceil(atkTotal * COMBAT.ATTACKER_LOSS_PCT);
    defLost     = Math.ceil(defTotal * COMBAT.DEFENDER_LOSS_PCT);
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
  // Headline only — persistBattleResult appends the loot once land is settled
  const summary = attackerWins
    ? `${attacker.name} overpowered ${defender.name} (${Math.round(effective)} vs ${defPower}).`
    : `${defender.name} repelled ${attacker.name}'s attack (${Math.round(effective)} vs ${defPower}).`;

  return {
    winner, attackerPower: atkPower, defenderPower: defPower,
    variance, attackerLost: atkLost, defenderLost: defLost,
    landGained: 0, buildingsDestroyed: 0, moneyStolen, attackerMoraleDelta: atkMorale,
    defenderMoraleDelta: defMorale, seed, summary,
  };
}

function lootText(defenderName: string, landGained: number, buildingsDestroyed: number, moneyStolen: number): string {
  const money = `${moneyStolen.toLocaleString("en-US")} money`;
  if (landGained === 0) return `${defenderName} has no land left to take. Seized ${money}.`;
  const razed = buildingsDestroyed > 0
    ? ` (razed ${buildingsDestroyed} building${buildingsDestroyed === 1 ? "" : "s"})`
    : "";
  return `Seized ${landGained} land${razed} and ${money}.`;
}

// ── Casualties ─────────────────────────────────────────────────────────────

/**
 * Splits `lost` units across unit stacks in proportion to their size
 * (largest-remainder method), never taking more than a stack holds.
 * Returns stack id → units lost.
 */
export function distributeLosses(
  stacks: Array<{ id: string; quantity: number }>,
  lost: number,
): Map<string, number> {
  const result = new Map<string, number>();
  const total  = stacks.reduce((s, u) => s + u.quantity, 0);
  const toLose = Math.min(Math.max(0, lost), total);
  if (toLose === 0) return result;

  const shares = stacks.map((u) => {
    const exact = (u.quantity * toLose) / total;
    return { id: u.id, quantity: u.quantity, loss: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let remaining = toLose - shares.reduce((s, x) => s + x.loss, 0);
  for (const x of [...shares].sort((a, b) => b.frac - a.frac || b.quantity - a.quantity)) {
    if (remaining === 0) break;
    if (x.loss < x.quantity) { x.loss += 1; remaining -= 1; }
  }
  for (const x of shares) if (x.loss > 0) result.set(x.id, x.loss);
  return result;
}

/**
 * Moves land from defender to attacker, razing defender buildings so built land
 * can be claimed. Building losses are spread across types in proportion to count.
 * Returns what was taken and the defender's total land afterwards.
 */
async function seizeLand(
  tx: Prisma.TransactionClient,
  attackerNationId: string,
  defenderNationId: string,
): Promise<{ landTaken: number; buildingsDestroyed: number; defenderTotalAfter: number }> {
  const res       = await tx.resource.findUniqueOrThrow({ where: { nationId: defenderNationId }, select: { land: true } });
  const buildings = await tx.building.findMany({
    where:  { nationId: defenderNationId, count: { gt: 0 } },
    select: { id: true, count: true },
  });
  const buildingCount = buildings.reduce((s, b) => s + b.count, 0);
  const plan = planLandSeizure(res.land, buildingCount);

  if (plan.buildingsDestroyed > 0) {
    const razed = distributeLosses(
      buildings.map((b) => ({ id: b.id, quantity: b.count })),
      plan.buildingsDestroyed,
    );
    for (const [id, n] of razed) {
      await tx.building.update({ where: { id }, data: { count: { decrement: n } } });
    }
  }
  if (plan.defenderFreeDelta !== 0) {
    await tx.resource.update({
      where: { nationId: defenderNationId },
      data:  { land: { increment: plan.defenderFreeDelta } },
    });
  }
  if (plan.landTaken > 0) {
    await tx.resource.update({
      where: { nationId: attackerNationId },
      data:  { land: { increment: plan.landTaken } },
    });
  }

  return {
    landTaken:          plan.landTaken,
    buildingsDestroyed: plan.buildingsDestroyed,
    defenderTotalAfter: totalLand(res.land + plan.defenderFreeDelta, buildingCount - plan.buildingsDestroyed),
  };
}

/**
 * Removes battle casualties from a nation's armies and re-syncs Nation.totalUnits
 * from what is actually left. Reads stacks inside the transaction so a concurrent
 * battle can never push a quantity below zero.
 */
async function applyCasualties(
  tx: Prisma.TransactionClient,
  nationId: string,
  lost: number,
): Promise<void> {
  const stacks = await tx.unit.findMany({
    where:  { army: { nationId }, quantity: { gt: 0 } },
    select: { id: true, quantity: true },
  });

  const losses = distributeLosses(stacks, lost);
  for (const [id, loss] of losses) {
    await tx.unit.update({ where: { id }, data: { quantity: { decrement: loss } } });
  }

  const remaining = stacks.reduce((s, u) => s + u.quantity - (losses.get(u.id) ?? 0), 0);
  await tx.nation.update({ where: { id: nationId }, data: { totalUnits: remaining } });
}

// ── DB write after resolution ──────────────────────────────────────────────

export interface PersistedBattle {
  battleId:            string;
  landGained:          number;
  buildingsDestroyed:  number;
  /** Full summary including loot. */
  summary:             string;
  /** Set when the defender was knocked down to the land floor and got a ruin shield. */
  defenderShieldUntil: Date | null;
  /** Defender housing types left over capacity, with their desertion deadlines. */
  defenderOverflow:    OverflowDeadlines;
}

export async function persistBattleResult(
  attackerNationId: string,
  defenderNationId: string,
  defenderName: string,
  result: BattleResult,
  turnsCost: number,
): Promise<PersistedBattle> {
  return prisma.$transaction(async (tx) => {
    // 1. Land (razing buildings as needed) — computed here from fresh data
    let defenderTotalAfter: number | null = null;
    let final: BattleResult = result;
    if (result.winner === "ATTACKER") {
      const seized = await seizeLand(tx, attackerNationId, defenderNationId);
      defenderTotalAfter = seized.defenderTotalAfter;
      final = {
        ...result,
        landGained:         seized.landTaken,
        buildingsDestroyed: seized.buildingsDestroyed,
        summary: `${result.summary} ${lootText(defenderName, seized.landTaken, seized.buildingsDestroyed, result.moneyStolen)}`,
      };
    }

    // 2. Battle record
    const b = await tx.battle.create({
      data: {
        worldId:         "world_01",
        attackerNationId,
        defenderNationId,
        winner:      final.winner,
        status:      "RESOLVED",
        seed:        final.seed,
        landGained:  final.landGained,
        moneyStolen: final.moneyStolen,
        turnsCost,
      },
    });

    // 3. Transfer money
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

    // 4. Casualties
    await applyCasualties(tx, attackerNationId, result.attackerLost);
    await applyCasualties(tx, defenderNationId, result.defenderLost);

    // 4b. Housing — razing may leave the defender's army without room (starts a
    // desertion deadline); losses may let either side's army fit again
    const defenderOverflow = await syncOverflowDeadlines(tx, defenderNationId);
    await syncOverflowDeadlines(tx, attackerNationId);

    // 5. Apply morale changes
    await tx.moraleRecord.update({
      where: { nationId: attackerNationId },
      data:  { morale: { increment: result.attackerMoraleDelta } },
    });
    await tx.moraleRecord.update({
      where: { nationId: defenderNationId },
      data:  { morale: { increment: result.defenderMoraleDelta } },
    });

    // 6. Store report
    await tx.battleReport.create({
      data: {
        battleId: b.id,
        payload:  JSON.parse(JSON.stringify(final)),
      },
    });

    // 7. Ruin shield — a beaten enclave at the land floor gets time to recover
    let defenderShieldUntil: Date | null = null;
    if (defenderTotalAfter !== null && defenderTotalAfter <= COMBAT.LAND_FLOOR) {
      defenderShieldUntil = await grantRuinShield(tx, defenderNationId);
    }

    return {
      battleId:           b.id,
      landGained:         final.landGained,
      buildingsDestroyed: final.buildingsDestroyed,
      summary:            final.summary,
      defenderShieldUntil,
      defenderOverflow,
    };
  }, { timeout: 15_000 });  // several round-trips to a remote DB — default 5s is tight
}
