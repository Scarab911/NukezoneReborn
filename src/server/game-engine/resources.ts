import { ECONOMY, MORALE } from "@/lib/game-constants";
import type { Resource, MoraleRecord } from "@prisma/client";

export interface NationEconomyState {
  resource: Pick<Resource, "money" | "land" | "energy">;
  morale:   Pick<MoraleRecord, "morale">;
  totalUnits: number;
  buildingCount: number;
}

export interface ResourceDelta {
  money: number;
  energy: number;
}

export function calculateIncome(state: NationEconomyState): ResourceDelta {
  const moraleMultiplier = 0.5 + (state.morale.morale / 100) * 0.8;
  const landIncome = state.resource.land * ECONOMY.BASE_INCOME_PER_LAND;

  return {
    money:  Math.floor(landIncome * moraleMultiplier),
    energy: 0,
  };
}

export function calculateUpkeep(state: NationEconomyState): number {
  const { totalUnits } = state;
  if (totalUnits <= ECONOMY.UPKEEP_SCALE_THRESHOLD) {
    return Math.floor(totalUnits * ECONOMY.UPKEEP_PER_UNIT);
  }
  const base   = ECONOMY.UPKEEP_SCALE_THRESHOLD * ECONOMY.UPKEEP_PER_UNIT;
  const excess = totalUnits - ECONOMY.UPKEEP_SCALE_THRESHOLD;
  return Math.floor(base + excess * ECONOMY.UPKEEP_PER_UNIT * 1.5);
}

export function processTick(state: NationEconomyState): {
  moneyDelta:  number;
  moraleDelta: number;
} {
  const income  = calculateIncome(state);
  const upkeep  = calculateUpkeep(state);
  const netMoney = income.money - upkeep;

  return {
    moneyDelta:  netMoney,
    moraleDelta: MORALE.REGEN_BASE,
  };
}
