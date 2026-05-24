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

  // Strategic weapons — flat damage to defense power
  NUKE_DAMAGE:    500,
  CHEM_DAMAGE:    200,
  BIO_DAMAGE:     300,
  EMP_MULTIPLIER: 0,   // disables 50% of defender income next tick
} as const;

// ── Buildings ─────────────────────────────────────────────────────────────
export const BUILDINGS = {
  LAND_PER_BUILDING: 5,     // each building consumes 5 land
  MONEY_COST: {
    WAR_FACTORY:    500,
    AIRFIELD:       800,
    SHIPYARD:       1000,
    RESEARCH_LAB:   600,
    POWER_PLANT:    400,
    MISSILE_SILO:   2000,
    DEFENSE_TOWERS: 300,
  },
  // Multipliers per building (stack additively up to max)
  BONUS: {
    WAR_FACTORY:    0.05,   // +5% ground unit attack per building
    AIRFIELD:       0.05,   // +5% air unit attack per building
    SHIPYARD:       0.05,   // +5% sea unit attack per building
    RESEARCH_LAB:   0.10,   // +10% research speed per building
    POWER_PLANT:    50,     // +50 energy per building
    MISSILE_SILO:   1,      // +1 strategic weapon slot per silo
    DEFENSE_TOWERS: 0.08,   // +8% defense per building
  },
  MAX_PER_TYPE: 10,         // max 10 of any building type
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
