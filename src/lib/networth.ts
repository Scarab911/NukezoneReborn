// Networth and attack range — pure helpers shared by client and server.
import { BUILDINGS, COMBAT } from "@/lib/game-constants";

const NW_PER_UNIT = 10;
const NW_PER_LAND = 5;

/**
 * Resource.land only holds *free* land — building consumes it. An enclave's
 * real size is its free land plus the land under its buildings.
 */
export function totalLand(freeLand: number, buildingCount: number): number {
  return freeLand + buildingCount * BUILDINGS.LAND_PER_BUILDING;
}

/** `land` is total land (see totalLand), so building never lowers networth. */
export function calcNetworth({ totalUnits, land }: { totalUnits: number; land: number }): number {
  return totalUnits * NW_PER_UNIT + land * NW_PER_LAND;
}

/** Networth band an enclave with `networth` can attack (inclusive). */
export function attackRange(networth: number): { min: number; max: number } {
  return {
    min: Math.ceil(networth * COMBAT.RANGE_RATIO),
    max: Math.floor(networth / COMBAT.RANGE_RATIO),
  };
}

export type RangeStatus = "IN_RANGE" | "TOO_WEAK" | "TOO_STRONG";

export function rangeStatus(myNetworth: number, targetNetworth: number): RangeStatus {
  const { min, max } = attackRange(myNetworth);
  if (targetNetworth < min) return "TOO_WEAK";
  if (targetNetworth > max) return "TOO_STRONG";
  return "IN_RANGE";
}

export function isInAttackRange(myNetworth: number, targetNetworth: number): boolean {
  return rangeStatus(myNetworth, targetNetworth) === "IN_RANGE";
}

/** Land an attack win would take: 5% of total land (min 1), never below the land floor. */
export function landTakenOnWin(defenderTotalLand: number): number {
  const available = Math.max(0, defenderTotalLand - COMBAT.LAND_FLOOR);
  return Math.min(available, Math.max(1, Math.floor(defenderTotalLand * COMBAT.LAND_STEAL_PCT)));
}

export interface LandSeizure {
  /** Land the attacker gains (added to their free land). */
  landTaken:          number;
  /** Defender buildings razed so their land can be claimed. */
  buildingsDestroyed: number;
  /** Change to the defender's free land (Resource.land). */
  defenderFreeDelta:  number;
}

/**
 * Splits a winning attack's land grab between free and built land in proportion
 * to how much of each the defender has. Built land is claimed by razing buildings
 * (each frees LAND_PER_BUILDING); any freed land the attacker doesn't take stays
 * with the defender as free land.
 */
export function planLandSeizure(freeLand: number, buildingCount: number): LandSeizure {
  const perBuilding = BUILDINGS.LAND_PER_BUILDING;
  const total       = totalLand(freeLand, buildingCount);
  const take        = landTakenOnWin(total);
  if (take === 0 || total === 0) return { landTaken: 0, buildingsDestroyed: 0, defenderFreeDelta: 0 };

  // Proportional share of the grab that falls on built land, in whole buildings
  let destroyed = Math.min(buildingCount, Math.round((take * buildingCount) / total));
  // Not enough free land to cover the rest? Raze more buildings
  while (freeLand + destroyed * perBuilding < take && destroyed < buildingCount) destroyed++;

  const landTaken = Math.min(take, freeLand + destroyed * perBuilding);
  return {
    landTaken,
    buildingsDestroyed: destroyed,
    defenderFreeDelta:  destroyed * perBuilding - landTaken,
  };
}
