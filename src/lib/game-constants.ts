// All numeric game balance values live here.
// Never hardcode these in services, components, or engine files.

// ── Tick intervals (ms) ──────────────────────────────────────────────────────
export const TICK = {
  FAST_MS:       5_000,
  ECONOMY_MS:    30_000,
  MARKET_MS:     300_000,
  BANK_MS:       3_600_000,
  WORLD_MS:      3_600_000,
  MAINTENANCE_MS: 86_400_000,
} as const;

// ── Economy ──────────────────────────────────────────────────────────────────
export const ECONOMY = {
  TAX_PER_LAND:              10,    // gold per land tile per economy tick
  FOOD_PER_LAND:             5,     // food produced per land tile per tick
  STEEL_PER_MINE:            8,
  ENERGY_PER_PLANT:          15,
  ENERGY_PER_BUILDING:       2,
  FOOD_PER_POP:              0.01,  // food consumed per population unit per tick
  POP_PER_LAND_OPTIMAL:      100,   // optimal population density
  UPKEEP_GOLD_PER_UNIT:      0.5,   // per economy tick
  UPKEEP_SCALE_THRESHOLD:    500,   // units above this scale exponentially
  UPKEEP_SCALE_EXPONENT:     1.15,
  MAX_INCOME_MULTIPLIER:     5.0,
} as const;

// ── Storage limits ───────────────────────────────────────────────────────────
export const STORAGE = {
  GOLD_BASE:  10_000,
  GOLD_PER_LAND: 500,
  STEEL_BASE: 5_000,
  STEEL_PER_MINE: 200,
  FOOD_BASE:  2_000,
  FOOD_PER_LAND: 100,
} as const;

// ── Banking ──────────────────────────────────────────────────────────────────
export const BANK = {
  INTEREST_RATE_PER_HOUR:      0.005,
  MAX_INTEREST_BEARING_BALANCE: 500_000,
  WITHDRAWAL_FEE:               0.02,
  LOAN_RATE_PER_HOUR:           0.02,
  MAX_LOAN_MULTIPLIER:          3,
} as const;

// ── Market ───────────────────────────────────────────────────────────────────
export const MARKET = {
  SELL_TAX:            0.05,   // 5% of proceeds destroyed — primary gold sink
  CANCEL_FEE:          0.01,
  MAX_OPEN_ORDERS:     10,
  MIN_ORDER_SIZE:      10,
  MAX_ORDER_SIZE:      10_000,
} as const;

// ── Morale ───────────────────────────────────────────────────────────────────
export const MORALE = {
  REGEN_BASE:          2,
  REGEN_PEACE_BONUS:   3,
  STARVATION:          -30,
  TERRITORY_CAPTURED:  -15,
  CAPITAL_ATTACKED:    -25,
  NUKE_DETONATED:      -40,
  ALLY_BETRAYED:       -20,
  ENEMY_DESTROYED:     +10,
  TERRITORY_LIBERATED: +12,
  RESEARCH_COMPLETED:  +5,
} as const;

// ── Battle ───────────────────────────────────────────────────────────────────
export const BATTLE = {
  LOOT_PER_UNIT:       10,    // gold carrying capacity per surviving unit
  MAX_LOOT_PERCENT:    0.25,  // cannot loot more than 25% of defender's balance
  RETREAT_HP_PERCENT:  0.20,  // attacker auto-retreats below 20% units remaining
  RETREAT_CASUALTY:    0.33,  // 33% of retreating units lost during retreat
  BASE_INTERCEPT_CHANCE: 0.15,
} as const;

// ── Military travel ──────────────────────────────────────────────────────────
export const MOVEMENT = {
  BASE_SPEED_TILES_PER_TICK: 1,  // tiles crossed per fast tick at speed=1
} as const;

// ── Nuclear ──────────────────────────────────────────────────────────────────
export const NUCLEAR = {
  COOLDOWN_MS:        3_600_000,  // 1 hour between launches
  RADIATION_DURATION_MS: 259_200_000, // 3 days
} as const;

// ── Espionage ────────────────────────────────────────────────────────────────
export const ESPIONAGE = {
  BASE_SLOTS:           3,
  SLOTS_PER_RESEARCH:   2,
  MAX_SLOTS:            15,
  MAX_OPS_PER_TARGET_24H: 5,
  REPEAT_COST_MULTIPLIER: 1.5,
  POST_CATCH_COOLDOWN_MS:  3_600_000,
} as const;

// ── Starting nation ──────────────────────────────────────────────────────────
export const STARTING = {
  HP:         1000,
  GOLD:       5000,
  FOOD:       1000,
  STEEL:      500,
  ENERGY:     200,
  LAND_TILES: 10,
  MORALE:     75,
  PROTECTION_HOURS: 48,  // new player grace period
} as const;
