# BATTLE ENGINE — NukezoneReborn

## Core Principles

1. **Server authoritative only.** Clients never compute combat results. Client shows animations and receives the final report.
2. **Deterministic.** Given the same inputs, `battleEngine.resolve()` always produces the same outputs. This enables replays.
3. **Seeded randomness.** Randomness is reproducible via a stored seed — no re-rolling.
4. **Transactional.** Battle results are applied atomically or not at all.
5. **Idempotent resolution.** Resolving an already-resolved battle is a no-op.

---

## Battle Lifecycle

```
CREATED (army starts moving)
    │
    │ ← ArmyMovement.eta reached (BullMQ delayed job fires)
    ▼
PENDING_RESOLUTION
    │
    │ ← battleEngine.resolve() called by battle-worker
    ▼
RESOLVING (lock held)
    │
    ├── Success path ──►  RESOLVED (report generated, loot transferred)
    │
    └── Timeout / Error ─►  FORCED_DRAW (safe fallback)
```

---

## Pre-Battle Modifiers

Before phase calculations, gather all modifiers that will affect the battle:

```typescript
interface BattleModifiers {
  // Attacker modifiers
  attackerMoraleMultiplier: number;      // from Morale domain
  attackerTechBonus: number;             // from Research domain
  attackerSurpriseBonus: number;         // +0.15 if undetected by defender scouts

  // Defender modifiers
  defenderMoraleMultiplier: number;
  defenderTechBonus: number;
  defenderTerrainBonus: number;          // from Territory domain (mountains: +0.2, plains: 0)
  defenderFortificationBonus: number;    // if defender built fortifications

  // Shared
  allianceReinforcement: number;         // bonus from MDP allies who joined the battle
  radiationPenalty: number;              // fighting in irradiated territory
}

async function gatherModifiers(battle: Battle): Promise<BattleModifiers> {
  const [attackerMorale, defenderMorale] = await Promise.all([
    moraleService.getMorale(battle.attackerNationId),
    moraleService.getMorale(battle.defenderNationId),
  ]);

  const terrain = await territoryService.getTerrain(battle.targetTerritoryId);
  
  return {
    attackerMoraleMultiplier: 0.6 + (attackerMorale / 100) * 0.8,
    defenderMoraleMultiplier: 0.6 + (defenderMorale / 100) * 0.8,
    attackerTechBonus: await researchService.getMilitaryBonus(battle.attackerNationId),
    defenderTechBonus: await researchService.getMilitaryBonus(battle.defenderNationId),
    defenderTerrainBonus: TERRAIN_DEFENSE_BONUS[terrain.type] ?? 0,
    defenderFortificationBonus: await militaryService.getFortificationBonus(battle.defenderNationId),
    attackerSurpriseBonus: await espionageService.didSurpriseAttack(battle) ? 0.15 : 0,
    allianceReinforcement: await allianceService.getReinforcementBonus(battle.defenderNationId),
    radiationPenalty: await territoryService.getRadiationPenalty(battle.targetTerritoryId),
  };
}
```

---

## Unit Counter Matrix

Rock-paper-scissors counter system — unit types counter other unit types:

```typescript
// Multiplier when unit type A attacks unit type B
// Read as: COUNTERS[attacker][defender] = damage multiplier
const COUNTERS: Record<UnitType, Record<UnitType, number>> = {
  INFANTRY:   { INFANTRY: 1.0, ARMOR: 0.6, AIR: 1.4, ARTILLERY: 1.2, INTERCEPTOR: 1.0 },
  ARMOR:      { INFANTRY: 1.5, ARMOR: 1.0, AIR: 0.4, ARTILLERY: 1.3, INTERCEPTOR: 0.8 },
  AIR:        { INFANTRY: 1.3, ARMOR: 1.6, AIR: 1.0, ARTILLERY: 1.4, INTERCEPTOR: 0.5 },
  ARTILLERY:  { INFANTRY: 1.4, ARMOR: 1.0, AIR: 0.3, ARTILLERY: 1.0, INTERCEPTOR: 0.7 },
  INTERCEPTOR:{ INFANTRY: 0.3, ARMOR: 0.2, AIR: 1.8, ARTILLERY: 0.4, INTERCEPTOR: 1.0 },
};

// Nuclear weapons don't counter — they deal flat damage to everything
```

---

## Battle Resolution Algorithm

```typescript
interface BattleInput {
  battleId: string;
  attackingArmy: ArmyComposition;   // { unitType: count }
  defendingArmy: ArmyComposition;
  modifiers: BattleModifiers;
  seed: number;                     // stored in Battle record at creation time
}

interface BattleResult {
  winner: 'ATTACKER' | 'DEFENDER' | 'DRAW';
  phases: BattlePhase[];
  attackerCasualties: ArmyComposition;
  defenderCasualties: ArmyComposition;
  lootedResources: ResourceDelta;
  territoryTransferred: boolean;
  report: BattleReportData;
}

async function resolve(battleId: string): Promise<BattleResult> {
  const battle = await prisma.battle.findUniqueOrThrow({
    where: { id: battleId },
    include: { attackingArmy: true, defendingArmy: true },
  });

  if (battle.status === 'RESOLVED') return getBattleResult(battleId); // idempotent

  const modifiers = await gatherModifiers(battle);
  const rng = createSeededRNG(battle.seed); // deterministic

  // Mutable army state (copies — don't mutate DB models)
  let attackerHP = buildArmyHP(battle.attackingArmy);
  let defenderHP = buildArmyHP(battle.defendingArmy);
  const phases: BattlePhase[] = [];

  // ── PHASE 1: INTELLIGENCE ────────────────────────────────────────────
  // Determine if stealth units reached target undetected
  const stealthResolved = resolveStealthPhase(battle, rng, phases);

  // ── PHASE 2: ARTILLERY EXCHANGE ──────────────────────────────────────
  // Long-range units fire before close engagement
  if (battle.attackingArmy.ARTILLERY > 0 || battle.defendingArmy.ARTILLERY > 0) {
    const artilleryResult = resolveArtilleryPhase(attackerHP, defenderHP, modifiers, rng);
    attackerHP = artilleryResult.attackerHP;
    defenderHP = artilleryResult.defenderHP;
    phases.push({ type: 'ARTILLERY', ...artilleryResult });
  }

  // ── PHASE 3: AIR SUPERIORITY ─────────────────────────────────────────
  if (battle.attackingArmy.AIR > 0 || battle.defendingArmy.AIR > 0) {
    const airResult = resolveAirPhase(attackerHP, defenderHP, modifiers, rng);
    attackerHP = airResult.attackerHP;
    defenderHP = airResult.defenderHP;
    phases.push({ type: 'AIR', ...airResult });
  }

  // ── PHASE 4: MAIN GROUND ENGAGEMENT ─────────────────────────────────
  const groundResult = resolveGroundPhase(attackerHP, defenderHP, modifiers, rng);
  attackerHP = groundResult.attackerHP;
  defenderHP = groundResult.defenderHP;
  phases.push({ type: 'GROUND', ...groundResult });

  // ── PHASE 5: RETREAT CHECK ───────────────────────────────────────────
  const retreatResult = checkRetreat(attackerHP, defenderHP, modifiers);
  if (retreatResult.attackerRetreats) {
    // Apply retreat casualties (33% of remaining units)
    attackerHP = applyRetreatCasualties(attackerHP, rng);
    phases.push({ type: 'RETREAT', retreater: 'ATTACKER' });
  }

  // ── DETERMINE WINNER ─────────────────────────────────────────────────
  const winner = determineWinner(attackerHP, defenderHP, retreatResult);

  // ── CALCULATE LOOT ───────────────────────────────────────────────────
  const loot = winner === 'ATTACKER'
    ? calculateLoot(battle.defenderNationId, attackerHP, modifiers)
    : { gold: 0, steel: 0, food: 0 };

  // ── GENERATE REPORT ──────────────────────────────────────────────────
  const report = generateBattleReport(battle, phases, winner, loot, modifiers);

  return {
    winner,
    phases,
    attackerCasualties: computeCasualties(battle.attackingArmy, attackerHP),
    defenderCasualties: computeCasualties(battle.defendingArmy, defenderHP),
    lootedResources: loot,
    territoryTransferred: winner === 'ATTACKER',
    report,
  };
}
```

---

## Phase Formulas

### Artillery Phase

```typescript
function resolveArtilleryPhase(
  attackerHP: ArmyHP,
  defenderHP: ArmyHP,
  mods: BattleModifiers,
  rng: SeededRNG,
): ArtilleryPhaseResult {
  // Artillery fires simultaneously — both sides take damage at the same time

  const attackerArtDamage =
    attackerHP.ARTILLERY * UNIT_TYPES.ARTILLERY.attack
    * mods.attackerMoraleMultiplier
    * mods.attackerTechBonus
    * (1 + rng.next() * 0.2 - 0.1); // ±10% variance

  const defenderArtDamage =
    defenderHP.ARTILLERY * UNIT_TYPES.ARTILLERY.attack
    * mods.defenderMoraleMultiplier
    * mods.defenderTechBonus
    * mods.defenderTerrainBonus
    * (1 + rng.next() * 0.2 - 0.1);

  // Damage distributes across all unit types proportionally to count
  return {
    attackerHP: applyDamageProportional(attackerHP, defenderArtDamage),
    defenderHP: applyDamageProportional(defenderHP, attackerArtDamage),
    attackerDamageDealt: attackerArtDamage,
    defenderDamageDealt: defenderArtDamage,
  };
}
```

### Ground Engagement Phase

```typescript
function resolveGroundPhase(
  attackerHP: ArmyHP,
  defenderHP: ArmyHP,
  mods: BattleModifiers,
  rng: SeededRNG,
): GroundPhaseResult {
  // Round-based combat — max 10 rounds
  let roundResults = [];

  for (let round = 0; round < 10; round++) {
    if (getTotalHP(attackerHP) <= 0 || getTotalHP(defenderHP) <= 0) break;

    // For each attacker unit type, calculate damage against each defender unit type
    let roundAttackerDamage = 0;
    let roundDefenderDamage = 0;

    for (const [atkType, atkCount] of Object.entries(attackerHP)) {
      for (const [defType, defCount] of Object.entries(defenderHP)) {
        if (atkCount <= 0 || defCount <= 0) continue;

        const counterMultiplier = COUNTERS[atkType as UnitType][defType as UnitType];
        const damage = atkCount
          * UNIT_TYPES[atkType as UnitType].attack
          * counterMultiplier
          * mods.attackerMoraleMultiplier
          * mods.attackerTechBonus
          * (1 + rng.next() * 0.3 - 0.15); // ±15% variance per unit pair

        // Damage focused on the defending unit type being attacked
        defenderHP[defType as UnitType] = Math.max(0, defCount - Math.floor(damage / UNIT_TYPES[defType as UnitType].defense));
        roundAttackerDamage += damage;
      }
    }

    // Mirror for defender's counter-attack
    // ... (same logic, swap attacker/defender + add terrain bonus)

    roundResults.push({ round, attackerDamage: roundAttackerDamage, defenderDamage: roundDefenderDamage });
  }

  return { attackerHP, defenderHP, rounds: roundResults };
}
```

---

## Retreat Logic

```typescript
function checkRetreat(attackerHP: ArmyHP, defenderHP: ArmyHP, mods: BattleModifiers): RetreatResult {
  const attackerRemainingPercent = getTotalHP(attackerHP) / attackerHP.total;
  const defenderRemainingPercent = getTotalHP(defenderHP) / defenderHP.total;

  // Attacker retreats if:
  // - Less than 20% units remaining, OR
  // - Morale collapsed (from modifiers), OR
  // - Lost more than 60% of elite units (AIR + ARMOR)
  const attackerRetreats =
    attackerRemainingPercent < 0.20 ||
    mods.attackerMoraleMultiplier < 0.4 ||
    (attackerHP.AIR + attackerHP.ARMOR) < (attackerHP.initial.AIR + attackerHP.initial.ARMOR) * 0.4;

  // Defender cannot retreat (they're defending their territory)
  // But if reduced to 0, territory is captured
  const defenderDefeated = getTotalHP(defenderHP) <= 0;

  return { attackerRetreats, defenderDefeated };
}
```

---

## Loot Calculation

```typescript
function calculateLoot(defenderNationId: string, survivingAttackers: ArmyHP, mods: BattleModifiers): ResourceDelta {
  // Loot scales with:
  // 1. How many attackers survived (more survivors = more carrying capacity)
  // 2. Attacker's looting tech bonus
  // 3. Capped at 25% of defender's gold (prevents total economic destruction)

  const defenderResources = await resourceService.getResources(defenderNationId);
  const carryingCapacity = getTotalHP(survivingAttackers) * CONSTANTS.LOOT_PER_UNIT;

  return {
    gold:  Math.min(defenderResources.gold  * 0.25, carryingCapacity * 0.6),
    steel: Math.min(defenderResources.steel * 0.25, carryingCapacity * 0.3),
    food:  Math.min(defenderResources.food  * 0.25, carryingCapacity * 0.1),
  };
}
```

---

## Nuclear Strike Resolution

Nuclear weapons bypass the normal battle engine. They are processed separately.

```typescript
async function resolveNuclearStrike(battleId: string): Promise<void> {
  const battle = await prisma.battle.findUniqueOrThrow({ where: { id: battleId } });

  const intercepted = await resolveInterception(battle);

  if (intercepted) {
    phases.push({ type: 'INTERCEPTED', interceptorCount: intercepted.count });
    // Partial intercept: damage reduced proportionally
    // Full intercept: no detonation
    if (intercepted.fully) {
      await finalizeBattle(battle, 'INTERCEPTED');
      return;
    }
  }

  // Detonation
  const weapon = NUCLEAR_WEAPONS[battle.weaponType];
  const targetNation = await nationService.getNation(battle.defenderNationId);
  
  // HP damage — nukes ignore defense stats
  const hpDamage = weapon.baseDamage * (1 - targetNation.nuclearShieldRating);
  
  await prisma.$transaction([
    prisma.nation.update({ where: { id: battle.defenderNationId }, data: { hp: { decrement: hpDamage } } }),
    // Create radiation zone
    prisma.radiationZone.create({
      data: {
        territoryId: battle.targetTerritoryId,
        intensity: weapon.radiationIntensity,
        expiresAt: new Date(Date.now() + weapon.radiationDurationMs),
      },
    }),
    // Massive morale hit
    prisma.moraleRecord.update({
      where: { nationId: battle.defenderNationId },
      data: { morale: { decrement: MORALE_DELTAS.NUKE_DETONATED } },
    }),
  ]);

  // Check if nation destroyed
  const updated = await prisma.nation.findUniqueOrThrow({ where: { id: battle.defenderNationId } });
  if (updated.hp <= 0) {
    await nationService.destroyNation(battle.defenderNationId, battle.attackerNationId);
  }

  // Announce to world if large nuke
  if (weapon.type === 'ICBM') {
    await worldEventService.announceNukeDetonation(battle);
  }
}
```

---

## Intercept Resolution

```typescript
async function resolveInterception(battle: Battle): Promise<InterceptResult | null> {
  const defenderInterceptors = await militaryService.getStationedInterceptors(battle.defenderNationId);
  if (defenderInterceptors === 0) return null;

  const weapon = NUCLEAR_WEAPONS[battle.weaponType];
  
  // Each interceptor has an independent intercept chance
  // Chance reduced for faster weapons (ICBMs harder to intercept than tactical nukes)
  const interceptChancePerUnit = CONSTANTS.BASE_INTERCEPT_CHANCE / weapon.speed;

  let intercepted = 0;
  for (let i = 0; i < defenderInterceptors; i++) {
    if (rng.next() < interceptChancePerUnit) intercepted++;
    if (intercepted >= weapon.missilesRequired) break; // Fully intercepted
  }

  const fully = intercepted >= weapon.missilesRequired;
  return { count: intercepted, fully };
}
```

---

## Seeded RNG

All randomness uses a deterministic seeded PRNG. Seed is stored in the Battle record.

```typescript
// Mulberry32 — fast, good distribution, deterministic
function createSeededRNG(seed: number): SeededRNG {
  let s = seed;
  return {
    next(): number {
      s |= 0; s = s + 0x6D2B79F5 | 0;
      let z = Math.imul(s ^ s >>> 15, 1 | s);
      z = z + Math.imul(z ^ z >>> 7, 61 | z) ^ z;
      return ((z ^ z >>> 14) >>> 0) / 4294967296;
    },
  };
}

// Seed generation: combines battle context, not guessable by client
function generateBattleSeed(attackerId: string, defenderId: string, timestamp: number): number {
  const str = `${attackerId}:${defenderId}:${Math.floor(timestamp / 5000)}`; // rounded to tick
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
```

---

## Battle Report Structure

```typescript
interface BattleReportData {
  id: string;
  battleId: string;
  worldTimestamp: Date;
  attackerNationId: string;
  defenderNationId: string;
  winner: 'ATTACKER' | 'DEFENDER' | 'DRAW';
  
  // Attacker sees their own losses + what they dealt
  attackerReport: {
    unitsSent: ArmyComposition;
    unitsLost: ArmyComposition;
    unitsReturned: ArmyComposition;
    damageDealt: number;
    resourcesLooted: ResourceDelta;
  };

  // Defender sees their own losses + what they know about attacker
  defenderReport: {
    unitsLost: ArmyComposition;
    resourcesLost: ResourceDelta;
    attackerUnitsLost: ArmyComposition;  // From surviving units / scout intel
    incomingDamage: number;
  };
  
  phases: BattlePhase[];           // Full phase-by-phase log
  replaySeed: number;              // For deterministic replay
  modifiersApplied: string[];      // Human-readable list ("Terrain bonus: +20%")
}
```

---

## Transaction Flow for Battle Resolution

```typescript
await prisma.$transaction(async (tx) => {
  // 1. Mark battle resolved (idempotency gate)
  await tx.battle.update({ where: { id: battleId }, data: { status: 'RESOLVED', resolvedAt: new Date() } });

  // 2. Remove casualties from both armies
  await tx.army.update({ where: { id: battle.attackingArmyId }, data: result.attackerArmyUpdate });
  await tx.army.update({ where: { id: battle.defendingArmyId }, data: result.defenderArmyUpdate });

  // 3. Transfer loot atomically
  if (result.loot.gold > 0) {
    await tx.resource.update({ where: { nationId: battle.defenderNationId }, data: { gold: { decrement: result.loot.gold } } });
    await tx.resource.update({ where: { nationId: battle.attackerNationId }, data: { gold: { increment: result.loot.gold } } });
  }

  // 4. Transfer territory
  if (result.winner === 'ATTACKER') {
    await tx.territory.update({
      where: { id: battle.targetTerritoryId },
      data: { ownerNationId: battle.attackerNationId },
    });
  }

  // 5. Apply morale changes
  await tx.moraleRecord.update({ where: { nationId: battle.attackerNationId }, data: { morale: { increment: result.attackerMoraleDelta } } });
  await tx.moraleRecord.update({ where: { nationId: battle.defenderNationId }, data: { morale: { increment: result.defenderMoraleDelta } } });

  // 6. Store battle report
  await tx.battleReport.create({ data: result.report });

  // 7. Create casualty records
  await tx.casualty.createMany({ data: result.casualties });
});
```
