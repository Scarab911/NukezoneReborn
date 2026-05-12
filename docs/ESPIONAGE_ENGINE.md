# ESPIONAGE & THIEF ENGINE — NukezoneReborn

## Design Philosophy

Espionage and thief operations serve a distinct strategic purpose: **they create paranoia, information asymmetry, and political tension** that cannot be resolved by military power alone. A small nation with good espionage can destabilize a large military power.

Key design goals:
- Operations must be **genuinely risky** — success is never guaranteed
- Detection must create **uncertainty**, not certainty (false positives exist)
- Operations are **asynchronous** — they resolve while the player is offline
- The system must be **anti-gameable** — formulas cannot be reliably min-maxed

---

## Spy System

### Spy Unit Stats

```typescript
interface SpyUnit {
  id: string;
  nationId: string;
  skillLevel: number;        // 1–10, upgraded through use and research
  status: 'IDLE' | 'ON_MISSION' | 'CAPTURED' | 'DEAD';
  missionsCompleted: number;
  captureCount: number;
}

// Spy slots are limited
const SPY_SLOT_CONSTANTS = {
  BASE_SLOTS: 3,
  SLOTS_PER_RESEARCH_LEVEL: 2,     // Research unlocks more
  MAX_SLOTS: 15,
};
```

### Operation Types

```typescript
enum SpyOperationType {
  // Intelligence gathering
  SCOUT_MILITARY    = 'SCOUT_MILITARY',    // Reveals army composition (estimate, not exact)
  SCOUT_ECONOMY     = 'SCOUT_ECONOMY',     // Reveals resource levels (estimate)
  STEAL_BLUEPRINTS  = 'STEAL_BLUEPRINTS',  // Reveals research in progress
  
  // Active operations
  SABOTAGE_COMMS    = 'SABOTAGE_COMMS',    // Disrupts defender's incoming alerts for 1hr
  SABOTAGE_RADAR    = 'SABOTAGE_RADAR',    // Disables intercept early warning for 30min
  PLANT_MISINFORMATION = 'PLANT_MISINFORMATION', // Delivers false intel report to target
  ASSASSINATE_COMMANDER = 'ASSASSINATE',   // Kills a unit commander: -15% unit effectiveness
}
```

### Operation Lifecycle

```
Player initiates spy op
        │
        ▼
POST /api/espionage/operations
  - Validate spy is IDLE
  - Validate gold available
  - Validate target is legal (not allied)
  - Deduct gold (transactional)
  - Set spy status = ON_MISSION
  - Create SpyOperation{status: IN_TRANSIT}
  - Schedule BullMQ delayed job: espionage:resolve
        │
        │  ← delay: transitTime + operationDuration (randomized)
        ▼
espionage-worker: processSpyOperation(opId)
  - Roll detection (see Detection Formula)
  - If detected: handle detection path
  - If success: handle success path
  - Set spy status = IDLE (or CAPTURED)
  - Create SpyReport
  - Notify player via WS / push
```

### Timing

```typescript
function calculateOperationTiming(op: SpyOperation, spyUnit: SpyUnit): number {
  const baseDuration = SPY_OP_DURATIONS[op.type]; // e.g., SCOUT_MILITARY = 3600000ms (1hr)
  
  // More skilled spy = faster
  const skillMultiplier = 1 - (spyUnit.skillLevel - 1) * 0.05; // 5% faster per level
  
  // Add randomness — cannot be precisely predicted (+/- 20%)
  const variance = baseDuration * 0.2;
  const random = Math.random() * variance * 2 - variance; // uniform [-20%, +20%]
  
  return Math.floor(baseDuration * skillMultiplier + random);
}
```

---

## Detection Formula

This is the most sensitive formula in the espionage system. It must balance:
- High-skill spies being reliably useful (reward investment)
- High-CI defenders being able to protect themselves (reward counter-investment)
- Enough randomness that outcomes aren't perfectly predictable

```typescript
interface DetectionRoll {
  detected: boolean;
  spyCaptured: boolean;     // subset of detected
  isFalsePositive: boolean; // defender alerted but no spy present (paranoia mechanic)
}

function rollDetection(spy: SpyUnit, target: Nation, op: SpyOperation): DetectionRoll {
  // Base detection chance: defender CI vs spy skill
  // CI rating 1–100 (investment dependent)
  // Spy skill 1–10

  const spySkillFactor = spy.skillLevel / 10;           // 0.1 – 1.0
  const ciResistance = target.ciRating / 100;            // 0.0 – 1.0
  const opComplexity = OP_COMPLEXITY[op.type];           // 0.5 (scout) to 1.5 (assassinate)

  // Probability spy is NOT detected
  const successChance = clamp(
    (spySkillFactor / (spySkillFactor + ciResistance)) // baseline
    * (1 / opComplexity)                               // complex ops more risky
    * getResearchBonus(spy.nationId, 'ESPIONAGE_STEALTH'), // tech bonus
    0.05, // minimum 5% chance of detection (never perfectly safe)
    0.97, // maximum 97% success (never perfectly certain)
  );

  const detected = Math.random() > successChance;
  
  // If detected: 30% chance the spy is captured (vs escaping)
  // Higher CI = higher capture rate
  const captureChance = detected
    ? 0.2 + (ciResistance * 0.3)
    : 0;

  const spyCaptured = detected && Math.random() < captureChance;

  return { detected, spyCaptured, isFalsePositive: false };
}

// ── PARANOIA MECHANIC ─────────────────────────────────────────────────────
// Even with no spy present, CI systems sometimes fire false alarms.
// This creates genuine uncertainty for defenders.

async function maybeFireFalsePositive(targetNationId: string): Promise<void> {
  const nation = await nationService.getNation(targetNationId);
  
  // False positive chance: low CI = few false alarms (system is unreliable in both directions)
  // Medium CI = most false alarms (system is sensitive but noisy)  
  // High CI = fewer false alarms (system is sophisticated enough to filter)
  const falsePositiveChance = gaussianFalsePositiveCurve(nation.ciRating);
  
  if (Math.random() < falsePositiveChance) {
    await notificationService.emitToNation(targetNationId, {
      event: 'espionage:spy_detected',
      operationType: randomize(SpyOperationType), // attacker unknown, op type unknown
      captured: false,
      possiblyFalseAlarm: true, // hint shown to defender: "Your CI detected suspicious activity"
    });
  }
}

// Curve peaks at CI rating ~40: low CI misses everything, peak CI is noisy, high CI is clean
function gaussianFalsePositiveCurve(ciRating: number): number {
  const peak = 0.08; // 8% max false positive rate
  const mean = 40;
  const std = 20;
  return peak * Math.exp(-0.5 * Math.pow((ciRating - mean) / std, 2));
}
```

---

## Success Path: What the Operation Returns

```typescript
async function executeOperation(op: SpyOperation, spy: SpyUnit, tx: PrismaTransaction): Promise<SpyReport> {
  switch (op.type) {
    case 'SCOUT_MILITARY': {
      const realArmy = await militaryService.getArmy(op.targetNationId, tx);
      // Intelligence is NEVER perfectly accurate — introduces ±15% estimation error
      const estimatedArmy = addEstimationError(realArmy, 0.15);
      return {
        type: 'SCOUT_MILITARY',
        data: estimatedArmy,
        accuracy: spy.skillLevel >= 8 ? 'HIGH' : 'MEDIUM',
        timestamp: new Date(),
        expiresAt: addHours(new Date(), 6), // Intel becomes stale after 6 hours
      };
    }

    case 'SABOTAGE_RADAR': {
      await tx.nation.update({
        where: { id: op.targetNationId },
        data: {
          radarDisabledUntil: addMinutes(new Date(), 30),
        },
      });
      return { type: 'SABOTAGE_RADAR', success: true, duration: 30 };
    }

    case 'PLANT_MISINFORMATION': {
      // Deliver false intel report to the TARGET
      // The target receives a "spy report" showing fabricated data
      const fabricatedData = generateMisinformation(op.payload, spy.skillLevel);
      await notificationService.emitFalseIntel(op.targetNationId, fabricatedData);
      return { type: 'PLANT_MISINFORMATION', success: true };
    }
    // ... etc
  }
}

// Estimation error: adds noise proportional to errorRate
function addEstimationError<T extends Record<string, number>>(data: T, errorRate: number): T {
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [
      k,
      Math.max(0, Math.floor(v * (1 + (Math.random() * errorRate * 2 - errorRate))))
    ])
  ) as T;
}
```

---

## Thief Operations

Thieves are separate from spies. They're blunt instruments: high reward, high risk, purely economic.

### Thief Unit Stats

```typescript
interface ThiefUnit {
  id: string;
  nationId: string;
  agility: number;       // 1–10, determines steal % and escape chance
  status: 'IDLE' | 'ON_OPERATION' | 'JAILED' | 'DEAD';
}
```

### Operation Types

```typescript
enum ThiefOperationType {
  STEAL_GOLD         = 'STEAL_GOLD',      // Direct treasury theft
  STEAL_STEEL        = 'STEAL_STEEL',
  STEAL_FOOD         = 'STEAL_FOOD',
  SABOTAGE_MINE      = 'SABOTAGE_MINE',   // Disable a mine: -100% output for 2hrs
  SABOTAGE_FARM      = 'SABOTAGE_FARM',   // Reduce food output for 2hrs
  SABOTAGE_PLANT     = 'SABOTAGE_PLANT',  // Energy disruption for 1hr
  INCITE_RIOT        = 'INCITE_RIOT',     // -25 morale, 4hr duration
  ASSASSINATE        = 'ASSASSINATE',     // -20% military effectiveness, 2hr
}
```

### Theft Resolution

```typescript
async function resolveTheftOperation(opId: string): Promise<void> {
  const op = await prisma.thiefOperation.findUniqueOrThrow({ where: { id: opId } });
  const thief = await prisma.thiefUnit.findUniqueOrThrow({ where: { id: op.thiefUnitId } });
  const target = await nationService.getNation(op.targetNationId);

  // Step 1: Can the thief reach the target without being caught?
  const infiltrationSuccess = rollInfiltration(thief, target);

  if (!infiltrationSuccess.success) {
    // Thief caught trying to infiltrate
    await handleThiefCaught(op, thief, target, infiltrationSuccess.captured);
    return;
  }

  // Step 2: Execute the theft
  const result = await executeTheft(op, thief, target);

  // Step 3: Can the thief escape after the operation?
  const escapedClean = rollEscape(thief, target, result.stolen);

  if (!escapedClean) {
    // Caught during/after the operation
    // Victim gets a report: confirmed theft, thief identity partially revealed
    await handleThiefCaughtPostOp(op, thief, target, result);
  } else {
    // Clean escape — victim may or may not know they were robbed
    // Delayed detection: they'll notice missing resources on next economy tick
    await scheduleDelayedDetection(op, target, result);
  }

  await finalizeOperation(op, thief, result);
}

function rollInfiltration(thief: ThiefUnit, target: Nation): { success: boolean; captured: boolean } {
  const infiltrationChance = clamp(
    (thief.agility / 10) / (thief.agility / 10 + target.securityRating / 100),
    0.10, 0.95,
  );
  const success = Math.random() < infiltrationChance;
  const captured = !success && Math.random() < (0.3 + target.securityRating * 0.003);
  return { success, captured };
}
```

### Theft Amount Calculation

```typescript
function calculateStealAmount(thief: ThiefUnit, target: Nation, opType: ThiefOperationType): number {
  const resourceType = OP_RESOURCE_MAP[opType];
  const targetBalance = target.resources[resourceType];

  // Base steal: scales with thief agility and target wealth
  const baseStealPercent = 0.01 + (thief.agility / 10) * 0.04; // 1% to 5%
  const baseSteal = targetBalance * baseStealPercent;

  // Cap per operation — prevents one-shot economic destruction
  const maxSteal = Math.min(baseSteal, THIEF_CONSTANTS.MAX_STEAL_PER_OP[resourceType]);

  // Anti-farming: diminishing returns if same target hit repeatedly
  const recentOpsAgainstTarget = await getRecentOpsCount(thief.nationId, target.id, 24 * 3600 * 1000);
  const diminishingMultiplier = Math.pow(0.7, recentOpsAgainstTarget);

  return Math.floor(maxSteal * diminishingMultiplier);
}
```

---

## Counter-Intelligence System

### CI Rating

```typescript
// CI rating (0–100) determines:
// 1. Detection chance of enemy spies
// 2. Infiltration resistance for thieves
// 3. False positive rate (paranoia)
// 4. Identity reveal chance when spy/thief is caught

// CI is built via:
// - Building Counter-Intelligence Centers (passive CI per building)
// - Hiring CI agents (costs upkeep, active CI bonus)
// - Research upgrades

function calculateCIRating(nation: NationWithBuildings): number {
  const buildingCI = nation.ciCenterCount * CONSTANTS.CI_PER_CENTER;
  const agentCI = nation.ciAgentCount * CONSTANTS.CI_PER_AGENT;
  const techBonus = nation.researchBonuses.counterIntelligence;
  
  return Math.min(100, buildingCI + agentCI + techBonus);
}
```

### Identity Reveal on Capture

When a spy or thief is caught:
- **Low-skill operation**: attacker remains anonymous (high uncertainty)
- **High-skill CI on defender**: partial identity revealed ("Nation in Eastern sector")
- **Very high CI**: full nation name revealed

This mechanic makes espionage politically consequential without being certain. A nation being repeatedly hit might suspect a neighbor, but not be 100% sure — creating diplomatic tension.

```typescript
function revealIdentity(spy: SpyUnit, defender: Nation): IdentityReveal {
  const revealChance = (defender.ciRating / 100) * 0.8;
  
  if (Math.random() > revealChance) {
    return { level: 'ANONYMOUS', nationId: null };
  }
  
  if (defender.ciRating < 60) {
    return { level: 'REGION', regionHint: getRegionHint(spy.nationId) };
  }
  
  return { level: 'IDENTIFIED', nationId: spy.nationId };
}
```

---

## Anti-Abuse Protections

```typescript
const ESPIONAGE_LIMITS = {
  // Prevent spy-farming a single target
  MAX_OPS_PER_TARGET_PER_24H: 5,
  
  // Prevent mass-spy coordination in alliances
  MAX_CONCURRENT_OPS_PER_NATION: 8,  // = max spy slots
  
  // Progressive cost increase for repeat operations
  REPEAT_OP_COST_MULTIPLIER: 1.5,    // each repeat against same target costs 50% more
  
  // Cooldown after catching a spy (prevents immediate re-infiltration)
  POST_CATCH_COOLDOWN_MS: 3_600_000, // 1 hour
  
  // Minimum interval between ops of same type against same target
  SAME_OP_TARGET_COOLDOWN_MS: 7_200_000, // 2 hours
};
```

---

## Notification Design for Espionage

Notifications must be carefully designed to avoid leaking too much information:

```typescript
// What defender receives when spy detected:
{
  event: 'espionage:spy_detected',
  operationType: 'SCOUT_MILITARY',     // they know WHAT type of op (so they know what was compromised)
  attackerNation: identityReveal,      // may be anonymous, hint, or full name
  spyCaptured: true,
  possiblyFalseAlarm: false,           // true for false positives
}

// What attacker receives when spy caught:
{
  event: 'espionage:spy_lost',
  spyId: 'spy_xxx',
  captured: true,                      // vs killed/escaped
  operationType: 'SCOUT_MILITARY',
  targetNationId: op.targetNationId,
}

// What attacker receives on success (silent delivery):
{
  event: 'espionage:report_ready',
  reportId: 'report_xxx',             // fetch via GET /api/espionage/reports/:id
}
```

## Note on Misinformation

The `PLANT_MISINFORMATION` operation creates a special case: the target receives a `espionage:report_ready` notification that looks like their own spy returned. The fabricated report appears identical in structure to a real one — only the data is false.

The defender has no in-game way to distinguish fabricated intel from real intel, unless they:
1. Independently verify through another spy (cross-reference)
2. Notice the data is inconsistent with other intelligence
3. Have a Research upgrade: "Disinformation Detection" (partial detection only)

This intentionally creates information warfare as a strategic layer.
