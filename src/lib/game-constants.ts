// All numeric game balance values — turn-based redesign

// ── Turns ─────────────────────────────────────────────────────────────────
export const TURNS = {
  REGEN_INTERVAL_MS: 5 * 60 * 1000, // 1 turn per 5 min
  MAX_TURNS:         100,
  STARTING_TURNS:    50,

  // Action costs
  ATTACK_COST:  1,
  BUILD_COST:   2,
  TRAIN_COST:   1,  // per 10 units
} as const;

// ── Economy ───────────────────────────────────────────────────────────────
export const ECONOMY = {
  // Income: money per tick
  BASE_INCOME_PER_LAND: 10,      // flat land income

  // Upkeep (per economy tick)
  UPKEEP_PER_UNIT: 0.1,          // gold per unit per tick
  UPKEEP_SCALE_THRESHOLD: 1000,  // units above this cost 1.5× more

  // Starting resources
  STARTING_MONEY:      5_000,
  STARTING_LAND:       100,
  STARTING_ENERGY:     200,
  STARTING_MORALE:     75,
  STARTING_TURNS:      50,

  // Storage caps
  MONEY_CAP_PER_LAND:  500,       // max money = land × 500
  LAND_MAX:            10_000,

  // Protection period for new nations (hours)
  PROTECTION_HOURS: 72,
} as const;

// ── Morale ────────────────────────────────────────────────────────────────
export const MORALE = {
  REGEN_BASE:        2,
  REGEN_PEACE_BONUS: 3,
  WIN_ATTACK:       +5,
  LOSE_ATTACK:      -8,
  NUKE_HIT:        -40,
  CHEM_HIT:        -20,
  STARVATION:      -15,
  RESEARCH_DONE:    +3,
} as const;

// ── Combat ────────────────────────────────────────────────────────────────
export const COMBAT = {
  VARIANCE_MIN:       0.85,  // ±15% RNG
  VARIANCE_MAX:       1.15,

  // On attacker victory
  LAND_STEAL_PCT:     0.05,  // steal 5% of defender's land
  MONEY_STEAL_PCT:    0.10,  // steal 10% of defender's money
  ATTACKER_LOSS_PCT:  0.10,  // attacker loses 10% of units
  DEFENDER_LOSS_PCT:  0.30,  // defender loses 30% of units

  // On attacker defeat
  ATTACKER_LOSS_PCT_DEFEAT: 0.20,
  DEFENDER_LOSS_PCT_DEFEAT: 0.05,

  // Attack range: targets must have networth within [my × RATIO, my ÷ RATIO].
  // A single ratio keeps the range mutual — if A can reach B, B can reach A.
  RANGE_RATIO:       0.5,
  // Attacks can't take land below this (= starting land): enclaves get ruined, never wiped out
  LAND_FLOOR:        100,
  // Shield granted when an enclave is knocked down to LAND_FLOOR
  RUIN_SHIELD_HOURS: 24,

  // Strategic weapons — flat damage to defense power
  NUKE_DAMAGE:    500,
  CHEM_DAMAGE:    200,
  BIO_DAMAGE:     300,
  EMP_MULTIPLIER: 0,   // disables 50% of defender income next tick
} as const;

// ── Buildings ─────────────────────────────────────────────────────────────
export const BUILDINGS = {
  LAND_PER_BUILDING: 5,     // each building consumes 5 land
  MAX_PER_ORDER:     5,     // buildings per build request — land is the only total limit
  STARTING_BARRACKS: 2,     // a new enclave starts with these (on its starting land)
  MONEY_COST: {
    BARRACKS:       400,
    WAR_FACTORY:    500,
    AIRFIELD:       800,
    SHIPYARD:       1000,
    RESEARCH_LAB:   600,
    POWER_PLANT:    400,
    MISSILE_SILO:   2000,
    DEFENSE_TOWERS: 300,
  },
  DEFENSE_TOWER_BONUS: 0.08, // +8% defense per Defense Tower
  RESEARCH_LAB_SPEED:  0.10, // research time ÷ (1 + 10% × labs × power level)
} as const;

// ── Power grid ────────────────────────────────────────────────────────────
// Power is a capacity, not a stockpile: Power Plants supply it, every other
// building draws it. A new building needs spare power. If razing leaves the grid
// short, power level = supply ÷ demand scales Defense Towers and Research Labs,
// and training is blocked until it's back to 100%.
export const POWER = {
  STARTING_PLANTS: 1,
  SUPPLY_PER_PLANT: 10,
  DRAW: {
    BARRACKS:       1,
    WAR_FACTORY:    2,
    AIRFIELD:       2,
    SHIPYARD:       2,
    MISSILE_SILO:   3,
    RESEARCH_LAB:   3,
    DEFENSE_TOWERS: 2,
    POWER_PLANT:    0,
  },
} as const;

// ── Housing ───────────────────────────────────────────────────────────────
// Units live in buildings. Each unit type takes `space` in one housing building;
// each building of that type provides CAPACITY space. When razing leaves an army
// without room, the owner has OVERFLOW_GRACE_HOURS to fix it before the excess deserts.
export type HousingBuilding = "BARRACKS" | "WAR_FACTORY" | "AIRFIELD" | "SHIPYARD" | "MISSILE_SILO";

export const HOUSING = {
  OVERFLOW_GRACE_HOURS: 24,
  CAPACITY: {
    BARRACKS:     50,
    WAR_FACTORY:  20,
    AIRFIELD:     15,
    SHIPYARD:     10,
    MISSILE_SILO: 1,
  } satisfies Record<HousingBuilding, number>,
  UNITS: {
    "ranger-squad":         { building: "BARRACKS",     space: 1 },
    "spear-team":           { building: "BARRACKS",     space: 1 },
    "ghost-operators":      { building: "BARRACKS",     space: 1 },
    "shadow-cell":          { building: "BARRACKS",     space: 2 },
    "stealth-raider-wing":  { building: "BARRACKS",     space: 3 },
    "titan-apc":            { building: "WAR_FACTORY",  space: 3 },
    "storm-artillery":      { building: "WAR_FACTORY",  space: 3 },
    "titan-mbt":            { building: "WAR_FACTORY",  space: 4 },
    "predator-drone-swarm": { building: "AIRFIELD",     space: 2 },
    "viper-gunship":        { building: "AIRFIELD",     space: 3 },
    "strike-jet-squadron":  { building: "AIRFIELD",     space: 4 },
    "leviathan-destroyer":  { building: "SHIPYARD",     space: 3 },
    "phantom-submarine":    { building: "SHIPYARD",     space: 3 },
    "atlas-carrier":        { building: "SHIPYARD",     space: 6 },
    "emp-missile":          { building: "MISSILE_SILO", space: 1 },
    "chemical-missile":     { building: "MISSILE_SILO", space: 1 },
    "biochemical-missile":  { building: "MISSILE_SILO", space: 1 },
    "nuclear-missile":      { building: "MISSILE_SILO", space: 1 },
  } satisfies Record<string, { building: HousingBuilding; space: number }>,
} as const;

// ── Banking ───────────────────────────────────────────────────────────────
export const BANK = {
  INTEREST_RATE_PER_HOUR:       0.005,
  MAX_INTEREST_BEARING_BALANCE: 500_000,
  WITHDRAWAL_FEE:               0.02,
  LOAN_RATE_PER_HOUR:           0.02,
  MAX_LOAN_MULTIPLIER:          3,
} as const;

// ── Exploration ───────────────────────────────────────────────────────────
// turnCost  = EXPLORE_BASE_COST + floor(explorationCount / EXPLORE_COST_STEP)
// landGained = max(MIN_LAND, floor(BASE_LAND * LAND_DECAY^explorationCount))
//
// count=0 → 1 turn, 500 land    count=5  → 3 turns, 221 land
// count=10 → 6 turns, 97 land   count=20 → 11 turns, 18 land
export const EXPLORE = {
  BASE_LAND:        500,   // land gained on first exploration
  LAND_DECAY:       0.85,  // each exploration yields 15% less
  MIN_LAND:         10,    // floor — still gives something
  BASE_COST:        1,     // turns for first exploration
  COST_STEP:        2,     // cost increments every N explorations
} as const;

// ── Market ────────────────────────────────────────────────────────────────
export const MARKET = {
  SELL_TAX:      0.05,
  CANCEL_FEE:    0.01,
  MAX_ORDERS:    10,
  MIN_ORDER_QTY: 10,
} as const;

// ── Enclave identity ──────────────────────────────────────────────────────
export const ENCLAVE = {
  NAME_MIN:          2,
  NAME_MAX:          32,
  STARTING_RENAMES:  1,  // matches Nation.nameChangesLeft default
  // Assigned at random on founding — players don't pick colors
  COLORS: [
    "#ef4444", "#f97316", "#eab308", "#22c55e",
    "#3b82f6", "#a855f7", "#ec4899", "#14b8a6",
  ],
} as const;
