// Army housing — pure helpers shared by client and server.
// Units live in buildings: each unit type takes `space` in one housing building
// type, and each building of that type provides HOUSING.CAPACITY space.
import { HOUSING, type HousingBuilding } from "@/lib/game-constants";

export const HOUSING_BUILDINGS = Object.keys(HOUSING.CAPACITY) as HousingBuilding[];

export const HOUSING_LABEL: Record<HousingBuilding, string> = {
  BARRACKS:     "Barracks",
  WAR_FACTORY:  "War Factory",
  AIRFIELD:     "Airfield",
  SHIPYARD:     "Shipyard",
  MISSILE_SILO: "Missile Silo",
};

export interface UnitHousing {
  building: HousingBuilding;
  space:    number;
}

export function isHousingBuilding(type: string): type is HousingBuilding {
  return type in HOUSING.CAPACITY;
}

/** Where a unit type lives and how much room it takes. Throws for an unmapped unit. */
export function housingFor(slug: string): UnitHousing {
  const h = (HOUSING.UNITS as Record<string, UnitHousing | undefined>)[slug];
  if (!h) throw new Error(`No housing defined for unit "${slug}" — add it to HOUSING.UNITS`);
  return h;
}

export type SpaceByBuilding = Record<HousingBuilding, number>;

function emptySpace(): SpaceByBuilding {
  return { BARRACKS: 0, WAR_FACTORY: 0, AIRFIELD: 0, SHIPYARD: 0, MISSILE_SILO: 0 };
}

/** Total space each housing building type provides. */
export function capacityByBuilding(buildings: Array<{ type: string; count: number }>): SpaceByBuilding {
  const cap = emptySpace();
  for (const b of buildings) {
    if (isHousingBuilding(b.type)) cap[b.type] += b.count * HOUSING.CAPACITY[b.type];
  }
  return cap;
}

/** Space the army uses in each housing building type. */
export function usageByBuilding(units: Array<{ slug: string; quantity: number }>): SpaceByBuilding {
  const used = emptySpace();
  for (const u of units) {
    if (u.quantity <= 0) continue;
    const h = housingFor(u.slug);
    used[h.building] += u.quantity * h.space;
  }
  return used;
}

/** Space over capacity per building type (0 when the army fits). */
export function overflowByBuilding(capacity: SpaceByBuilding, usage: SpaceByBuilding): SpaceByBuilding {
  const over = emptySpace();
  for (const t of HOUSING_BUILDINGS) over[t] = Math.max(0, usage[t] - capacity[t]);
  return over;
}

/**
 * Units that desert so at least `excessSpace` is freed. The excess is spread over
 * the stacks in proportion to the space each uses (largest remainder), freeing as
 * little extra as unit sizes allow, so the army always ends at or under capacity.
 * Returns stack id → units leaving.
 */
export function planDesertion(
  stacks: Array<{ id: string; quantity: number; space: number }>,
  excessSpace: number,
): Map<string, number> {
  const result = new Map<string, number>();
  const live   = stacks.filter((s) => s.quantity > 0 && s.space > 0);
  const total  = live.reduce((sum, s) => sum + s.quantity * s.space, 0);
  if (excessSpace <= 0 || total === 0) return result;

  // Each stack's exact share in units, floored; the rest goes by largest remainder
  // until enough space is freed (same idea as distributeLosses for battle losses)
  const shares = live.map((s) => {
    const exact = (excessSpace * s.quantity) / total;
    const n     = Math.min(s.quantity, Math.floor(exact));
    return { ...s, n, frac: exact - Math.floor(exact) };
  });
  let freed = shares.reduce((sum, s) => sum + s.n * s.space, 0);
  for (const s of [...shares].sort((a, b) => b.frac - a.frac || b.quantity - a.quantity)) {
    if (freed >= excessSpace) break;
    if (s.n < s.quantity) { s.n += 1; freed += s.space; }
  }
  for (const s of shares) if (s.n > 0) result.set(s.id, s.n);

  // Remainder rounding can still fall short with large unit sizes: top up from the largest stacks
  for (const s of [...live].sort((a, b) => b.quantity * b.space - a.quantity * a.space)) {
    while (freed < excessSpace && (result.get(s.id) ?? 0) < s.quantity) {
      result.set(s.id, (result.get(s.id) ?? 0) + 1);
      freed += s.space;
    }
  }
  return result;
}

/** Housing types with an open desertion deadline, for display. */
export function listOverflows(
  capacity:  SpaceByBuilding,
  usage:     SpaceByBuilding,
  deadlines: Partial<Record<HousingBuilding, string>>,
): Array<{ building: HousingBuilding; excessSpace: number; deadline: string }> {
  return HOUSING_BUILDINGS.flatMap((building) => {
    const deadline    = deadlines[building];
    const excessSpace = usage[building] - capacity[building];
    return deadline && excessSpace > 0 ? [{ building, excessSpace, deadline }] : [];
  });
}
