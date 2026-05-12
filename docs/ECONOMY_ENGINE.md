# ECONOMY ENGINE — NukezoneReborn

## Design Goals

1. **Inflation prevention** — money supply must be bounded
2. **Meaningful sinks** — gold must leave the economy consistently
3. **Late-game stability** — large nations cannot infinitely compound
4. **Fairness** — new players can catch up; dominant nations face scaling costs
5. **No duplication** — all transfers are atomic, no race conditions possible

---

## Resource Types

| Resource | Description | Primary Source | Primary Sink |
|---|---|---|---|
| **Gold** | Universal currency | Tax collection | Upkeep, research, market taxes |
| **Land** | Territory tiles owned | Conquest, starting grant | Conquest loss |
| **Population** | Workers and soldiers | Growth per tick | Starvation, combat casualties |
| **Food** | Population sustenance | Farms on land tiles | Population consumption |
| **Steel** | Military production | Mines | Unit training, building construction |
| **Energy** | Production multiplier | Power plants | Factory operation, advanced buildings |

---

## Economy Flow Diagram

```
INCOME SOURCES                        SINKS
──────────────                        ─────────────────────────────
Tax (land × pop × morale)  ──►  Gold  ──► Military upkeep (per tick)
Market sales (5% tax lost)          │    ──► Research costs (lump sum)
Alliance treasury payouts           │    ──► Building construction
Banking interest (capped)           │    ──► Spy / thief operation costs
Battle loot                         │    ──► Market sell tax (5% destroyed)
                                    │    ──► Nuclear launch fuel
                                    └──► BANK (earns 0.5%/hr, capped)

Food production (land × farm)  ──► Food ──► Population consumption
                                         ──► Army field rations (minor)

Mines  ──► Steel  ──► Unit training
                  ──► Building construction

Power plants  ──► Energy  ──► Factories, advanced buildings
```

---

## Gold Supply Controls

### Why inflation matters in browser MMOs:
After 6 months, veteran players have 1000x more gold than new players. Markets stop working. New players quit. The game collapses.

### Solution: Non-linear upkeep scaling

```typescript
const UPKEEP_CONSTANTS = {
  BASE_GOLD_PER_UNIT: 0.5,            // per economy tick (30s)
  SCALE_THRESHOLD: 500,               // units below this: base upkeep
  SCALE_EXPONENT: 1.15,               // above threshold: exponential
  MAX_INCOME_MULTIPLIER: 5.0,         // income cap: 5x base (prevents infinite compounding)
};

function militaryUpkeep(totalUnits: number): number {
  if (totalUnits <= SCALE_THRESHOLD) {
    return totalUnits * BASE_GOLD_PER_UNIT;
  }
  
  const baseUpkeep = SCALE_THRESHOLD * BASE_GOLD_PER_UNIT;
  const excessUnits = totalUnits - SCALE_THRESHOLD;
  const scaledUpkeep = excessUnits * BASE_GOLD_PER_UNIT * Math.pow(excessUnits / SCALE_THRESHOLD, SCALE_EXPONENT - 1);
  
  return baseUpkeep + scaledUpkeep;
}
```

### Storage Limits (preventing hoarding)

```typescript
const STORAGE_LIMITS = {
  gold:  (landCount: number) => 10_000 + (landCount * 500),
  steel: (mineCount: number) => 5_000 + (mineCount * 200),
  food:  (landCount: number) => 2_000 + (landCount * 100),
};

// Resources above cap are lost each economy tick (wasted production)
// This incentivizes spending and prevents passive accumulation
async function enforceStorageLimits(nationId: string, resources: Resource): Promise<Resource> {
  const nation = await nationService.getNation(nationId);
  const limits = computeLimits(nation);
  
  return {
    gold:  Math.min(resources.gold,  limits.gold),
    steel: Math.min(resources.steel, limits.steel),
    food:  Math.min(resources.food,  limits.food),
  };
}
```

---

## Starvation System

Starvation is a critical mechanic — it punishes over-expansion and poor planning.

```typescript
async function processStarvation(nationId: string, tx: PrismaTransaction): Promise<void> {
  const resources = await tx.resource.findUniqueOrThrow({ where: { nationId } });
  const nation = await tx.nation.findUniqueOrThrow({ where: { id: nationId } });

  if (resources.food > 0) return; // Not starving

  // Each starvation tick:
  // 1. Population decreases (1% per tick while starving)
  // 2. Morale collapses (-30 per tick — severe)
  // 3. Random unit desertion (0.5% of army per tick)
  
  const populationLoss = Math.floor(nation.population * 0.01);
  const desertionCount = Math.floor(nation.totalUnits * 0.005);

  await tx.nation.update({
    where: { id: nationId },
    data: { population: { decrement: populationLoss } },
  });

  await tx.moraleRecord.update({
    where: { nationId },
    data: { morale: { decrement: MORALE_DELTAS.STARVATION } }, // -30
  });

  if (desertionCount > 0) {
    await militaryService.applyDesertion(nationId, desertionCount, tx);
  }

  // Alert the player if this is the first starvation tick
  await notificationService.alertStarvation(nationId);
}
```

---

## Banking System

### Design: Banking as a safe but limited income source

The bank provides a small return on deposited gold. It is NOT a primary income source — it's a safety net and resource parking mechanism.

```typescript
const BANK_CONSTANTS = {
  INTEREST_RATE_PER_HOUR: 0.005,      // 0.5%/hr = 12%/day MAX
  MAX_INTEREST_BEARING_BALANCE: 500_000, // Interest stops accruing above this
  WITHDRAWAL_FEE: 0.02,               // 2% fee on withdrawals (gold sink)
  LOAN_RATE_PER_HOUR: 0.02,           // 2%/hr — loans are expensive
  MAX_LOAN_MULTIPLE: 3,               // Borrow up to 3x current gold balance
  LOAN_DEFAULT_PENALTY_MULTIPLIER: 2, // Default = pay double remaining balance
};

async function processInterest(nationId: string, tx: PrismaTransaction): Promise<void> {
  const account = await tx.bankAccount.findUniqueOrThrow({ where: { nationId } });
  if (account.balance <= 0) return;

  const interestBearingBalance = Math.min(account.balance, MAX_INTEREST_BEARING_BALANCE);
  const interest = Math.floor(interestBearingBalance * INTEREST_RATE_PER_HOUR);

  await tx.bankAccount.update({
    where: { nationId },
    data: { balance: { increment: interest } },
  });

  await tx.bankTransaction.create({
    data: { accountId: account.id, type: 'INTEREST', amount: interest },
  });
}
```

### Anti-Exploit: Interest Cap

Without the cap at 500k, a player who accumulated millions during peak activity would earn thousands per hour passively, compounding forever. The cap ensures banking is useful for temporary parking, not as the dominant strategy.

---

## Market System

### Order Book Design

```typescript
interface MarketOrder {
  id: string;
  nationId: string;
  side: 'BUY' | 'SELL';
  resource: ResourceType;
  quantity: number;
  pricePerUnit: number;
  filledQuantity: number;
  status: 'OPEN' | 'PARTIAL' | 'FILLED' | 'CANCELLED';
  createdAt: Date;
}

// Price-time priority matching (most common fair market algorithm)
async function matchOrders(resource: ResourceType): Promise<void> {
  const sells = await prisma.marketOrder.findMany({
    where: { resource, side: 'SELL', status: { in: ['OPEN', 'PARTIAL'] } },
    orderBy: [{ pricePerUnit: 'asc' }, { createdAt: 'asc' }],
    take: 100,
  });

  const buys = await prisma.marketOrder.findMany({
    where: { resource, side: 'BUY', status: { in: ['OPEN', 'PARTIAL'] } },
    orderBy: [{ pricePerUnit: 'desc' }, { createdAt: 'asc' }],
    take: 100,
  });

  for (const buy of buys) {
    for (const sell of sells) {
      if (buy.pricePerUnit < sell.pricePerUnit) break; // No match possible

      const fillQuantity = Math.min(
        buy.quantity - buy.filledQuantity,
        sell.quantity - sell.filledQuantity,
      );

      if (fillQuantity <= 0) continue;

      // Execute at sell price (seller sets the price)
      const totalPrice = fillQuantity * sell.pricePerUnit;
      const tax = Math.floor(totalPrice * MARKET_CONSTANTS.SELL_TAX); // 5% destroyed
      const sellerReceives = totalPrice - tax;

      await prisma.$transaction([
        // Transfer resource to buyer
        prisma.resource.update({ where: { nationId: buy.nationId }, data: { [resource]: { increment: fillQuantity } } }),
        // Transfer gold to seller (minus tax)
        prisma.resource.update({ where: { nationId: sell.nationId }, data: { gold: { increment: sellerReceives } } }),
        // Deduct gold from buyer
        prisma.resource.update({ where: { nationId: buy.nationId }, data: { gold: { decrement: totalPrice } } }),
        // Update order fill amounts
        prisma.marketOrder.update({ where: { id: buy.id }, data: { filledQuantity: { increment: fillQuantity } } }),
        prisma.marketOrder.update({ where: { id: sell.id }, data: { filledQuantity: { increment: fillQuantity } } }),
        // Record trade (for price history)
        prisma.marketTrade.create({
          data: { buyOrderId: buy.id, sellOrderId: sell.id, quantity: fillQuantity, price: sell.pricePerUnit },
        }),
      ]);
      
      // Note: `tax` gold is NEVER added anywhere — it is destroyed (primary gold sink)
    }
  }
}
```

### Market Anti-Abuse

```typescript
const MARKET_LIMITS = {
  MAX_OPEN_ORDERS_PER_PLAYER: 10,
  MIN_ORDER_SIZE: 10,
  MAX_ORDER_SIZE: 10_000,
  SAME_PRICE_COOLDOWN_MS: 60_000,      // Can't spam same price point
  CANCEL_FEE_PERCENT: 0.01,            // 1% listing fee retained on cancel (prevents spam)
};
```

---

## Alliance Treasury

The alliance treasury creates collective economy coordination — shared wealth, shared goals.

```typescript
interface AllianceTreasury {
  allianceId: string;
  gold: number;
  weeklyContributionTotal: number;
}

// Contributions are voluntary but tracked for reputation
async function contributeToTreasury(nationId: string, allianceId: string, amount: number): Promise<void> {
  await prisma.$transaction([
    prisma.resource.update({ where: { nationId }, data: { gold: { decrement: amount } } }),
    prisma.allianceTreasury.update({ where: { allianceId }, data: { gold: { increment: amount } } }),
    prisma.transaction.create({
      data: { type: 'ALLIANCE_CONTRIBUTION', from: nationId, allianceId, amount },
    }),
  ]);
}

// Withdrawals require leadership role and are audited
// Audit trail prevents embezzlement abuse by alliance leaders
```

---

## Resource Sink Summary

Why each sink exists:

| Sink | Amount | Purpose |
|---|---|---|
| Military upkeep | Scales exponentially with size | Prevents infinite army accumulation |
| Market sell tax | 5% destroyed | Primary ongoing gold sink |
| Banking withdrawal fee | 2% destroyed | Prevents bank as infinite safe |
| Research costs | High lump sums | Paces power progression |
| Nuclear launch fuel | Significant per launch | Limits spam launches |
| Building construction | Significant upfront | Paces infrastructure growth |
| Cancel order fee | 1% | Prevents market spam |
| Spy operation costs | Per op | Paces espionage |

---

## Economy Balance Notes

The economy is deliberately tuned so that:

1. **A new player can be viable within 2 hours** of starting (initial resource grant + fast early income)
2. **A 30-day veteran cannot be infinitely dominant** — upkeep scaling and storage limits cap their advantage
3. **Idle gold loses value** — storage overflow and inflation create pressure to spend
4. **War is net negative economically** — upkeep during campaigns + casualties + rebuild costs mean war must have a strategic purpose
5. **Banking is supplemental, not primary** — 0.5%/hr is good for short-term parking, not for growth
