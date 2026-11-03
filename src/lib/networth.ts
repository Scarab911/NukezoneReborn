// Networth and attack range — pure helpers shared by client and server.
import { COMBAT } from "@/lib/game-constants";

const NW_PER_UNIT = 10;
const NW_PER_LAND = 5;

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

/** Land an attack win would take: 5% (min 1), never below the land floor. */
export function landTakenOnWin(defenderLand: number): number {
  const available = Math.max(0, defenderLand - COMBAT.LAND_FLOOR);
  return Math.min(available, Math.max(1, Math.floor(defenderLand * COMBAT.LAND_STEAL_PCT)));
}
