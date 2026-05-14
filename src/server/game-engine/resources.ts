import { ECONOMY, MORALE, STORAGE } from "@/lib/game-constants";
import type { Nation, Resource, MoraleRecord } from "@prisma/client";

// Input snapshot — pure functions, no DB calls (testable in isolation)
export interface NationEconomyState {
  nation:     Pick<Nation, "id" | "totalUnits" | "status">; // buildingCount lives on state root
  resource:   Pick<Resource, "gold" | "food" | "steel" | "energy">;
  morale:     Pick<MoraleRecord, "morale">;
  landCount:  number;
  mineCount:  number;
  powerPlantCount: number;
  buildingCount:   number;
  population:      number;
  radiationPenalty: number; // 0.0 – 1.0
}

export interface ResourceDelta {
  gold:   number;
  food:   number;
  steel:  number;
  energy: number;
}

export interface UpkeepCost {
  goldCost:   number;
  energyCost: number;
}

// ── Income formula ────────────────────────────────────────────────────────────

export function calculateIncome(state: NationEconomyState): ResourceDelta {
  const { landCount, mineCount, powerPlantCount, buildingCount, population, morale, radiationPenalty } = state;

  const populationEfficiency = landCount > 0
    ? Math.min(1, population / (landCount * ECONOMY.POP_PER_LAND_OPTIMAL))
    : 0;

  const moraleMultiplier = 0.5 + (morale.morale / 100) * 0.8; // 0.5 – 1.3x

  const gold = Math.floor(
    landCount * ECONOMY.TAX_PER_LAND * populationEfficiency * moraleMultiplier,
  );

  const food = Math.floor(
    landCount * ECONOMY.FOOD_PER_LAND * (1 - radiationPenalty),
  );

  const steel = mineCount * ECONOMY.STEEL_PER_MINE;

  const energyProduced  = powerPlantCount * ECONOMY.ENERGY_PER_PLANT;
  const energyConsumed  = buildingCount   * ECONOMY.ENERGY_PER_BUILDING;
  const energy = energyProduced - energyConsumed;

  return { gold, food, steel, energy };
}

// ── Upkeep formula ────────────────────────────────────────────────────────────

export function calculateUpkeep(state: NationEconomyState): UpkeepCost {
  const { totalUnits } = state.nation;
  const { buildingCount } = state;

  // Upkeep scales exponentially above UPKEEP_SCALE_THRESHOLD
  let goldCost: number;
  if (totalUnits <= ECONOMY.UPKEEP_SCALE_THRESHOLD) {
    goldCost = totalUnits * ECONOMY.UPKEEP_GOLD_PER_UNIT;
  } else {
    const base   = ECONOMY.UPKEEP_SCALE_THRESHOLD * ECONOMY.UPKEEP_GOLD_PER_UNIT;
    const excess = totalUnits - ECONOMY.UPKEEP_SCALE_THRESHOLD;
    const scalingFactor = Math.pow(excess / ECONOMY.UPKEEP_SCALE_THRESHOLD, ECONOMY.UPKEEP_SCALE_EXPONENT - 1);
    goldCost = base + excess * ECONOMY.UPKEEP_GOLD_PER_UNIT * scalingFactor;
  }

  goldCost += buildingCount * 2; // flat building upkeep
  const energyCost = buildingCount * ECONOMY.ENERGY_PER_BUILDING;

  return { goldCost: Math.floor(goldCost), energyCost };
}

// ── Starvation check ──────────────────────────────────────────────────────────

export function isStarving(state: NationEconomyState): boolean {
  const { food } = state.resource;
  const consumed  = Math.floor(state.population * ECONOMY.FOOD_PER_POP);
  return food - consumed <= 0;
}

// ── Storage caps ──────────────────────────────────────────────────────────────

export function computeStorageCaps(
  landCount: number,
  mineCount: number,
): { gold: number; steel: number; food: number } {
  return {
    gold:  STORAGE.GOLD_BASE  + landCount * STORAGE.GOLD_PER_LAND,
    steel: STORAGE.STEEL_BASE + mineCount * STORAGE.STEEL_PER_MINE,
    food:  STORAGE.FOOD_BASE  + landCount * STORAGE.FOOD_PER_LAND,
  };
}

// ── Tick processor ────────────────────────────────────────────────────────────
// Returns the net delta to apply to the resource row.
// Callers are responsible for the DB write and morale updates.

export function processTick(state: NationEconomyState): {
  delta:       ResourceDelta;
  upkeep:      UpkeepCost;
  starving:    boolean;
  moraleDelta: number;
} {
  const income    = calculateIncome(state);
  const upkeep    = calculateUpkeep(state);
  const starving  = isStarving(state);

  const moraleDelta = starving
    ? MORALE.STARVATION
    : MORALE.REGEN_BASE;

  const delta: ResourceDelta = {
    gold:   income.gold - upkeep.goldCost,
    food:   income.food - Math.floor(state.population * ECONOMY.FOOD_PER_POP),
    steel:  income.steel,
    energy: income.energy - upkeep.energyCost,
  };

  return { delta, upkeep, starving, moraleDelta };
}
