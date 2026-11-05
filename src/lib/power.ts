// Power grid — pure helpers shared by client and server.
// Power is a capacity: Power Plants supply it, every other building draws it.
import { BUILDINGS, POWER } from "@/lib/game-constants";

type BuildingKey = keyof typeof POWER.DRAW;

function drawOf(type: string): number {
  return (POWER.DRAW as Record<string, number | undefined>)[type] ?? 0;
}

export function powerSupply(buildings: Array<{ type: string; count: number }>): number {
  return buildings.reduce((s, b) => s + (b.type === "POWER_PLANT" ? b.count * POWER.SUPPLY_PER_PLANT : 0), 0);
}

export function powerDraw(buildings: Array<{ type: string; count: number }>): number {
  return buildings.reduce((s, b) => s + b.count * drawOf(b.type), 0);
}

/** Power a new order of `count` buildings of `type` would draw. */
export function drawFor(type: BuildingKey | string, count: number): number {
  return drawOf(type) * count;
}

/** Share of demand the grid can meet, 0–1. A grid with no demand runs at 1. */
export function powerLevel(supply: number, draw: number): number {
  if (draw <= 0) return 1;
  return Math.max(0, Math.min(1, supply / draw));
}

export interface PowerState {
  supply: number;
  draw:   number;
  level:  number;
}

export function powerState(buildings: Array<{ type: string; count: number }>): PowerState {
  const supply = powerSupply(buildings);
  const draw   = powerDraw(buildings);
  return { supply, draw, level: powerLevel(supply, draw) };
}

/** Research duration with labs: base ÷ (1 + 10% × labs × power level), at least 1s. */
export function researchDurationSecs(baseSecs: number, labs: number, level: number): number {
  return Math.max(1, Math.round(baseSecs / (1 + BUILDINGS.RESEARCH_LAB_SPEED * labs * level)));
}
