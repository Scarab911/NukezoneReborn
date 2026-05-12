# DOMAIN MODULES — NukezoneReborn

Each domain is an isolated bounded context. Services in one domain MUST NOT import Prisma models from another domain. Cross-domain communication happens via service calls or published events only.

---

## 1. Auth Domain

**Responsibility:** Identity — who is this request, and are they who they say they are?

**Services:**
- `AuthService` — session validation, token refresh
- `CredentialsService` — password hashing, login validation
- `OAuthService` — Discord/Google OAuth flow

**DB Tables Owned:** `Player`, `Account`, `Session`, `VerificationToken`

**Events Emitted:**
- `auth.player.registered` → triggers User domain to create UserProfile, Economy domain to create Nation
- `auth.player.banned` → triggers WS disconnect for player

**Boundaries:**
- Auth NEVER reads Nation, Resource, or any game tables
- Auth ONLY returns `{ playerId, nationId, role }` — not game state
- All other domains receive `playerId` and trust it was validated upstream

**WebSocket:** None — Auth has no real-time concerns

**Scaling:** Stateless — scales horizontally. Session validation happens at Edge via NextAuth JWT.

---

## 2. User Domain

**Responsibility:** Player profile, preferences, reputation, activity tracking.

**Services:**
- `UserProfileService` — CRUD for display name, avatar, bio
- `ReputationService` — honor/dishonor tracking from game actions
- `ActivityService` — last seen, playtime, login streaks

**DB Tables Owned:** `UserProfile`, `UserSetting`, `Reputation`, `ActivityLog`

**Events Consumed:**
- `auth.player.registered` → create initial UserProfile
- `battle.resolved` → update reputation score
- `diplomacy.treaty.broken` → apply dishonor penalty

**Events Emitted:**
- `user.reputation.changed` → consumed by Leaderboard domain

**WebSocket:** Emits profile update to own session only (name change, avatar)

**Scaling:** Low write volume. Fully cacheable in Redis (UserProfile TTL: 5min).

---

## 3. Territory Domain

**Responsibility:** Land ownership, zone control, radiation, geographic game state.

**Services:**
- `TerritoryService` — ownership queries, capture processing
- `ZoneService` — zone bonuses, resource multipliers per terrain type
- `RadiationService` — radiation creation, spread, decay
- `MapService` — coordinate system, distance calculations, pathfinding

**DB Tables Owned:** `Territory`, `Zone`, `RadiationZone`, `TerritoryLog`

**Events Consumed:**
- `battle.territory.captured` → transfer ownership
- `battle.nuke.detonated` → create RadiationZone, spread to adjacent cells
- `worldevent.nuclear_winter.started` → amplify radiation spread rate

**Events Emitted:**
- `territory.captured` → consumed by Economy (tax base recalculation), Leaderboard
- `territory.irradiated` → consumed by Economy (production penalty), Notification (alert to owner)

**Distance Formula:**
```typescript
// Euclidean distance on grid, capped by world bounds
// Used by Military domain for travel time calculation
function gridDistance(a: Coordinate, b: Coordinate): number {
  return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
}

// Travel time in milliseconds
function travelTimeMs(distance: number, unitSpeed: number): number {
  return Math.ceil(distance / unitSpeed) * TICK_INTERVAL_MS;
}
```

**WebSocket:** Emits `map:territory_changed` and `map:radiation_zone_created` to world room (all players in game world)

**Scaling:** Territory table partitioned by `world_id`. Radiation zones are TTL-managed — the ECONOMY_TICK marks expired zones as inactive. Coordinate lookups are indexed on `(world_id, x, y)`.

---

## 4. Economy Domain

**Responsibility:** Resource generation, upkeep, starvation, spending, transactional balance sheet for each nation.

**Services:**
- `ResourceService` — balances, accumulation, deduction
- `UpkeepService` — per-tick military/building upkeep
- `TransactionService` — atomic gold transfers between nations
- `StorageService` — warehouse limits, overflow penalties

**DB Tables Owned:** `Nation`, `Resource`, `Transaction`, `UpkeepLog`

**Events Consumed:**
- `tick.economy` → run full economy tick for all active nations
- `territory.captured` → recalculate land-based income
- `territory.irradiated` → apply production penalty
- `battle.resolved` → apply looted resource transfers
- `research.completed` → apply production bonuses

**Events Emitted:**
- `economy.starvation.started` → consumed by Morale (heavy morale hit), Military (desertion)
- `economy.nation.bankrupt` → consumed by Notification, Morale
- `economy.resource.changed` → consumed by Leaderboard (power score)

**Upkeep Formula:**
```typescript
// Per ECONOMY_TICK (every 30s by default)
interface UpkeepResult {
  goldCost: number;
  energyCost: number;
}

function calculateUpkeep(nation: NationState): UpkeepResult {
  const baseUnitUpkeep = nation.totalUnits * CONSTANTS.GOLD_PER_UNIT_PER_TICK;
  const buildingUpkeep = nation.buildingCount * CONSTANTS.GOLD_PER_BUILDING_PER_TICK;
  
  // Upkeep scales non-linearly — large armies become expensive
  const armyScalingFactor = 1 + Math.max(0, (nation.totalUnits - CONSTANTS.UPKEEP_SCALE_THRESHOLD) / 1000) * 0.1;
  
  return {
    goldCost: Math.floor((baseUnitUpkeep + buildingUpkeep) * armyScalingFactor),
    energyCost: nation.buildingCount * CONSTANTS.ENERGY_PER_BUILDING,
  };
}
```

**Income Formula:**
```typescript
function calculateIncome(nation: NationState, territories: Territory[]): ResourceDelta {
  const landCount = territories.filter(t => !t.irradiated).length;
  const populationEfficiency = Math.min(1, nation.population / (landCount * CONSTANTS.POP_PER_LAND_OPTIMAL));
  const moraleMultiplier = nation.morale / 100;

  return {
    gold: Math.floor(landCount * CONSTANTS.TAX_PER_LAND * populationEfficiency * moraleMultiplier),
    food: Math.floor(landCount * CONSTANTS.FOOD_PER_LAND * (1 - nation.radiationPenalty)),
    steel: nation.mineCount * CONSTANTS.STEEL_PER_MINE,
    energy: (nation.powerPlantCount * CONSTANTS.ENERGY_PER_PLANT) - (nation.buildingCount * CONSTANTS.ENERGY_PER_BUILDING),
  };
}
```

**Transaction Safety:**
All gold movements use Prisma `$transaction` with optimistic locking:
```typescript
async function transferGold(fromId: string, toId: string, amount: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const sender = await tx.resource.findUniqueOrThrow({ where: { nationId: fromId } });
    if (sender.gold < amount) throw new InsufficientFundsError();
    
    await tx.resource.update({ where: { nationId: fromId }, data: { gold: { decrement: amount } } });
    await tx.resource.update({ where: { nationId: toId }, data: { gold: { increment: amount } } });
    await tx.transaction.create({ data: { from: fromId, to: toId, amount, type: 'TRANSFER' } });
  });
}
```

**WebSocket:** Emits `economy:update` to own player room after each tick (partial — only own nation)

**Scaling:** `Resource` table is the hottest write in the system. Use Postgres `FOR UPDATE SKIP LOCKED` during tick processing to process nations in parallel without deadlocks.

---

## 5. Banking Domain

**Responsibility:** Interest-bearing savings, loans, alliance treasury flows.

**Services:**
- `BankService` — deposit, withdraw, balance queries
- `InterestService` — per-BANK_TICK interest accumulation
- `LoanService` — loan issuance, repayment, default handling

**DB Tables Owned:** `BankAccount`, `BankTransaction`, `Loan`

**Constants:**
```typescript
BANK_INTEREST_RATE_PER_HOUR = 0.005;    // 0.5%/hr — prevents pure idle play
MAX_SAVINGS_INTEREST_CAP = 500_000;      // Interest stops accruing above this balance
LOAN_INTEREST_RATE_PER_HOUR = 0.02;      // 2%/hr — loans are risky
MAX_LOAN_MULTIPLIER = 3;                 // Can borrow up to 3x current gold
```

**Events Emitted:**
- `banking.loan.defaulted` → consumed by Morale (reputation hit), User (dishonor)

**Anti-Inflation:** Interest is only paid on gold DEPOSITED in the bank. Gold held directly earns no interest. Combined with the interest cap, this prevents passive wealth explosion.

**WebSocket:** None — banking changes are reflected on next economy tick push.

---

## 6. Market Domain

**Responsibility:** Player-to-player resource trading via order book. Price discovery. Market taxes.

**Services:**
- `OrderService` — place/cancel buy and sell orders
- `MatchingService` — order matching engine (price-time priority)
- `TaxService` — market transaction fee collection
- `PriceHistoryService` — OHLC price feed for UI charts

**DB Tables Owned:** `MarketOrder`, `MarketTrade`, `PriceHistory`

**Order Matching (MARKET_TICK — every 5 min):**
```typescript
// Price-time priority matching
async function matchOrders(resource: ResourceType): Promise<void> {
  // Get all unmatched sells (sorted ASC by price, then ASC by createdAt)
  // Get all unmatched buys (sorted DESC by price, then ASC by createdAt)
  // Match while bestBuy.price >= bestSell.price
  // Execute at sell price (seller names the price)
  // Apply 5% tax on seller proceeds (gold sink)
  // Create MarketTrade records
  // Transfer resources and gold atomically
}
```

**Market Tax (5%):** Primary gold sink. All sell proceeds have 5% deducted. Tax gold is destroyed (not redistributed) to prevent inflation.

**Events Emitted:**
- `market.price.updated` → consumed by Leaderboard (economic power metric), cached in Redis

**WebSocket:** Market prices are NOT real-time pushed (too much bandwidth, too much noise). Clients poll via TanStack Query every 60s or after own order matches.

---

## 7. Alliance Domain

**Responsibility:** Alliance creation, membership, treaties, shared treasury, collective declarations of war.

**Services:**
- `AllianceService` — create/join/leave/disband
- `TreatyService` — propose/accept/reject/expire treaties (NAP, Trade, Mutual Defense, War)
- `AllianceTreasuryService` — contributions, withdrawals, distributions
- `WarCouncilService` — alliance-wide war declarations, victory conditions

**DB Tables Owned:** `Alliance`, `AllianceMember`, `AllianceTreaty`, `AllianceTreasury`, `WarDeclaration`

**Treaty Types:**
```typescript
enum TreatyType {
  NON_AGGRESSION_PACT = 'NAP',          // Cannot attack each other
  TRADE_AGREEMENT = 'TRADE',            // Reduced market taxes between parties
  MUTUAL_DEFENSE = 'MDP',               // Auto-join if either attacked
  FULL_ALLIANCE = 'ALLIANCE',           // Shared map vision, shared treasury
  WAR_DECLARATION = 'WAR',              // Formal war state
}
```

**Alliance Warfare:**
- Alliance war requires WarCouncil vote (>50% of member nations)
- Alliance war creates WarDeclaration record
- Military domain checks active war declarations before blocking attacks

**Events Emitted:**
- `alliance.war.declared` → consumed by Notification (all members), Military (allow inter-alliance attacks)
- `alliance.treaty.broken` → consumed by User (reputation), Notification
- `alliance.member.left` → consumed by Notification

**WebSocket:** Emits alliance events to alliance room (`alliance:{allianceId}`): member joins, treasury changes, war declarations.

---

## 8. Military Domain

**Responsibility:** Unit ownership, unit training, army composition, army movement scheduling, attack validation.

**Services:**
- `UnitService` — unit types, owned units, training queue
- `ArmyService` — army composition, deployment, recall
- `MovementService` — schedule army movement, eta calculation, cancel movement
- `DefenseService` — stationed defense units, intercept systems

**DB Tables Owned:** `Unit`, `UnitTraining`, `Army`, `ArmyMovement`

**Unit Types:**
```typescript
const UNIT_TYPES = {
  INFANTRY:    { speed: 1, attack: 10, defense: 8, upkeep: 1, counters: ['ARMOR'] },
  ARMOR:       { speed: 0.7, attack: 25, defense: 15, upkeep: 3, counters: ['AIR'] },
  AIR:         { speed: 3, attack: 30, defense: 10, upkeep: 5, counters: ['INFANTRY', 'ARMOR'] },
  ARTILLERY:   { speed: 0.5, attack: 50, defense: 5, upkeep: 4, counters: [] },
  INTERCEPTOR: { speed: 5, attack: 0, defense: 0, upkeep: 3, counters: ['MISSILE'] },
  ICBM:        { speed: 10, attack: 500, defense: 0, upkeep: 10, counters: [], requires: 'NUKE_TECH' },
  TACTICAL_NUKE: { speed: 8, attack: 200, defense: 0, upkeep: 8, counters: [], requires: 'NUKE_TECH' },
} as const;
```

**Attack Validation:**
```typescript
async function validateAttack(attackerNationId: string, targetNationId: string): Promise<void> {
  // Check: is target an ally or NAP partner?
  const treaties = await allianceService.getActiveTreaties(attackerNationId, targetNationId);
  if (treaties.some(t => t.type === 'NAP' || t.type === 'ALLIANCE')) {
    throw new TreatyViolationError('Cannot attack a NAP/allied nation');
  }
  // Check: is attacker in nuclear cooldown?
  // Check: does attacker have enough fuel/resources for the launch?
  // Check: is attacker's own territory under attack? (can't split forces below defense minimum)
}
```

**Events Emitted:**
- `military.movement.started` → consumed by Notification (alert to target)
- `military.movement.arrived` → consumed by Battle domain (trigger battle resolution)
- `military.unit.trained` → no downstream consumers

**WebSocket:** Movement arrival times pushed to attacker's player room only. Target receives `alert:incoming` (no position data — just eta).

---

## 9. Battle Domain

**Responsibility:** Combat resolution, casualty calculation, territory transfer, battle reports.

See [docs/BATTLE_ENGINE.md](BATTLE_ENGINE.md) for full engine specification.

**Services:**
- `BattleService` — create, resolve, query battles
- `CasualtyService` — unit loss calculations
- `BattleReportService` — generate and store battle reports
- `ReplayService` — generate deterministic battle replay

**DB Tables Owned:** `Battle`, `BattlePhase`, `BattleReport`, `Casualty`

**Events Emitted:**
- `battle.resolved` → consumed by Economy (loot transfer), Territory (ownership change), Morale, Leaderboard
- `battle.nuke.detonated` → consumed by Territory (radiation), Notification (world announcement if large)
- `battle.nation.destroyed` → consumed by User (reputation), Leaderboard, Notification (world announcement)

**WebSocket:** Emits `battle:resolved` to both attacker and defender rooms with `reportId`. Full report fetched via REST.

---

## 10. Espionage Domain

**Responsibility:** Spy unit management, intelligence gathering operations, sabotage, counter-intelligence.

See [docs/ESPIONAGE_ENGINE.md](ESPIONAGE_ENGINE.md) for full engine specification.

**Services:**
- `SpyService` — spy unit training, slots management
- `OperationService` — initiate and resolve spy operations
- `IntelService` — store and query gathered intelligence
- `CounterIntelService` — CI rating, detection events

**DB Tables Owned:** `SpyUnit`, `SpyOperation`, `SpyReport`, `CIRating`, `IntelSnapshot`

**Events Emitted:**
- `espionage.operation.detected` → consumed by Notification (alert to target), User (reputation)
- `espionage.spy.captured` → consumed by Military (unit removed), Notification
- `espionage.intel.gathered` → consumed by Notification (deliver report to player)

---

## 11. Thief Operations Domain

**Responsibility:** Resource theft, treasury infiltration, sabotage of production buildings.

**Services:**
- `ThiefService` — thief unit management
- `ThieftOperationService` — initiate, time, resolve theft operations
- `SabotageService` — building damage, production reduction

**DB Tables Owned:** `ThiefUnit`, `ThiefOperation`, `ThiefReport`

**Operation Types:**
```typescript
enum ThiefOperationType {
  STEAL_GOLD     = 'STEAL_GOLD',      // Direct treasury theft
  STEAL_STEEL    = 'STEAL_STEEL',     // Steal production materials
  SABOTAGE_MINE  = 'SABOTAGE_MINE',   // Disable a mine for N ticks
  SABOTAGE_PLANT = 'SABOTAGE_PLANT',  // Disable power plant
  ASSASSINATE    = 'ASSASSINATE',     // Kill a military commander (morale hit)
  INCITE_RIOT    = 'INCITE_RIOT',     // Temporary morale collapse
}
```

**Paranoia Mechanic:**
False-positive detections (no actual thief present) fire at low probability when target nation has low CI. This creates uncertainty — players cannot be sure whether a detection alert means a real attack or a false alarm.

**Events Emitted:**
- `thief.operation.success` → consumed by Economy (resource transfer), Notification
- `thief.operation.detected` → consumed by Notification (alert to target — may be false positive)
- `thief.building.sabotaged` → consumed by Economy (production penalty)

---

## 12. Research Domain

**Responsibility:** Technology tree, weapon research, production upgrades, unlock management.

**Services:**
- `ResearchService` — start/cancel/complete research
- `TechTreeService` — available techs, prerequisites, bonuses
- `BonusService` — apply research bonuses to nation stats

**DB Tables Owned:** `ResearchProject`, `TechTree`, `TechBonus`, `UnlockedTech`

**Tech Categories:**
```typescript
enum TechCategory {
  MILITARY    = 'MILITARY',    // Unlock ICBM, Tactical Nuke, Stealth units
  ECONOMY     = 'ECONOMY',     // Production multipliers, storage upgrades
  DEFENSE     = 'DEFENSE',     // Interceptor upgrades, CI improvements
  ESPIONAGE   = 'ESPIONAGE',   // Better spy ops, lower detection chance
  NUCLEAR     = 'NUCLEAR',     // Required for all nuclear weapons
}
```

**Research is time-gated.** A ICBM research takes 72 real-world hours. No gold bypass. This is intentional — it prevents pay-to-win speedups and creates natural game pacing.

**Events Emitted:**
- `research.completed` → consumed by Military (unlock unit types), Economy (apply bonuses)

**WebSocket:** Emits `research:completed` to own player room.

---

## 13. Morale Domain

**Responsibility:** Nation morale tracking, morale-based modifiers, regeneration, events that drain morale.

**Services:**
- `MoraleService` — query morale, apply delta, clamp [0, 100]
- `RegenerationService` — per-ECONOMY_TICK morale regen

**DB Tables Owned:** `MoraleRecord`, `MoraleEvent`

**Morale Effects:**
```typescript
// Morale directly multiplies income and combat effectiveness
const moraleMultiplier = {
  income:   (morale: number) => 0.5 + (morale / 100) * 0.8,    // 0.5x at 0 morale, 1.3x at 100
  combat:   (morale: number) => 0.6 + (morale / 100) * 0.8,    // 0.6x at 0 morale, 1.4x at 100
  research: (morale: number) => 0.8 + (morale / 100) * 0.4,    // 0.8x to 1.2x
};
```

**Morale Events:**
```typescript
const MORALE_DELTAS = {
  TERRITORY_CAPTURED:   -15,
  CAPITAL_ATTACKED:     -25,
  NUKE_DETONATED:       -40,
  ALLY_BETRAYED:        -20,
  ENEMY_DESTROYED:      +10,
  TERRITORY_LIBERATED:  +12,
  RESEARCH_COMPLETED:   +5,
  STARVATION:           -30,  // per tick while starving
  REGEN_BASE:           +2,   // per ECONOMY_TICK (passive regen)
  REGEN_PEACE_BONUS:    +3,   // additional if no attacks in last 10 ticks
};
```

**Events Consumed:** Virtually everything — morale reacts to almost all other domain events.

**WebSocket:** Morale changes are included in `economy:update` push from Economy domain.

---

## 14. Notification Domain

**Responsibility:** In-game alerts, push notifications, notification history, fanout management.

**Services:**
- `AlertService` — create and deliver in-game alerts
- `PushService` — Web Push API (PWA) notifications
- `FanoutService` — broadcast to multiple recipients (alliance alerts)

**DB Tables Owned:** `Notification`, `PushSubscription`

**Notification Types:**
```typescript
enum NotificationType {
  INCOMING_ATTACK    = 'INCOMING_ATTACK',
  BATTLE_RESOLVED    = 'BATTLE_RESOLVED',
  SPY_DETECTED       = 'SPY_DETECTED',
  THIEF_DETECTED     = 'THIEF_DETECTED',
  DIPLOMACY_PROPOSAL = 'DIPLOMACY_PROPOSAL',
  RESEARCH_COMPLETE  = 'RESEARCH_COMPLETE',
  ALLIANCE_INVITE    = 'ALLIANCE_INVITE',
  WORLD_EVENT        = 'WORLD_EVENT',
  NATION_DESTROYED   = 'NATION_DESTROYED',  // World announcement
}
```

**Delivery Priority:**
1. `INCOMING_ATTACK` → WebSocket push (immediate) + push notification if offline
2. `BATTLE_RESOLVED` → WebSocket push if online, stored notification if offline
3. All others → stored notification, polled by client

**WebSocket:** This domain IS the WebSocket emitter. All other domains publish to a Redis pub/sub channel. The notification worker subscribes and fans out via Socket.io.

---

## 15. World Events Domain

**Responsibility:** Scheduled global events that affect all nations. Creates dynamic game phases.

**Services:**
- `WorldEventService` — create, activate, expire events
- `EventEffectService` — apply effects to all affected nations

**DB Tables Owned:** `WorldEvent`, `EventEffect`

**Event Types:**
```typescript
const WORLD_EVENTS = {
  NUCLEAR_WINTER: {
    duration: 3600 * 24 * 3,    // 3 days
    effect: 'food_production_penalty_50%',
    trigger: 'when_10th_nuke_detonated',
  },
  UN_SANCTIONS: {
    duration: 3600 * 6,           // 6 hours
    effect: 'nuclear_launches_blocked',
    trigger: 'scheduled',
    schedule: 'every_72_hours',
  },
  ARMS_EMBARGO: {
    duration: 3600 * 4,
    effect: 'weapon_research_halted',
    trigger: 'admin_manual',
  },
  ECONOMIC_BOOM: {
    duration: 3600 * 2,
    effect: 'income_bonus_25%',
    trigger: 'scheduled',
    schedule: 'random_within_168h_window',
  },
};
```

**Events Emitted:** `worldevent.started`, `worldevent.ended` → consumed by Economy (apply/remove modifiers), Notification (announce to all players), Territory (radiation spread modifier)

**WebSocket:** Broadcasts to world room when events start/end.

---

## 16. Leaderboard Domain

**Responsibility:** Rankings calculation, leaderboard snapshots, stat history, power score formula.

**Services:**
- `RankingService` — recalculate and store rankings
- `PowerScoreService` — calculate nation power score
- `SnapshotService` — store hourly snapshots for graphs

**DB Tables Owned:** `RankingSnapshot`, `StatHistory`

**Redis:** Leaderboard stored as a Redis Sorted Set. O(log N) insertions, O(log N + K) range queries.

```typescript
// Power score formula — weighted multi-factor
function calculatePowerScore(nation: NationState): number {
  return Math.floor(
    nation.totalUnits * 10 +
    nation.landCount * 5 +
    nation.resource.gold * 0.001 +
    nation.nukesDetonated * 500 +
    nation.nationsDestroyed * 1000 +
    nation.survivalDays * 50
  );
}
```

**Rankings are recalculated on WORLD_TICK (hourly).** Not real-time — avoids write storms. Leaderboard reads serve from Redis cache.

---

## 17. Anti-Cheat Domain

**Responsibility:** Behavioral analysis, bot detection, multi-account detection, economy anomaly detection, enforcement.

See [docs/ANTI_CHEAT.md](ANTI_CHEAT.md) for full specification.

**Services:**
- `BehaviorScoringService` — compute per-player risk score
- `AnomalyDetectionService` — detect unusual economy patterns
- `EnforcementService` — warn, suspend, ban

**DB Tables Owned:** `SecurityEvent`, `BehaviorScore`, `Ban`, `FingerprintRecord`

**Events Consumed:** Every API action emits a signal to the Anti-Cheat domain for behavioral analysis.

**WebSocket:** None — anti-cheat is silent. Enforcement actions trigger auth.player.banned event.
