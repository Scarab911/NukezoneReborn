import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { configDotenv } from "dotenv";
import path from "node:path";

configDotenv({ path: path.resolve(process.cwd(), ".env.local") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // ── GameWorld ────────────────────────────────────────────────────────────
  const world = await prisma.gameWorld.upsert({
    where: { name: "World 1" },
    update: {},
    create: {
      id: "world_01",
      name: "World 1",
      status: "ACTIVE",
      maxNations: 1000,
    },
  });
  console.log(`✓ GameWorld: ${world.name}`);

  // ── Unit Types ───────────────────────────────────────────────────────────
  const unitTypes = [
    { name: "Infantry",      slug: "infantry",      speed: 1.0, attack: 10,  defense: 8,  goldUpkeep: 1,  goldCost: 50,   steelCost: 0,    trainTimeSec: 60,   requiresTech: null,          sortOrder: 1 },
    { name: "Armor",         slug: "armor",         speed: 0.7, attack: 25,  defense: 15, goldUpkeep: 3,  goldCost: 200,  steelCost: 50,   trainTimeSec: 300,  requiresTech: null,          sortOrder: 2 },
    { name: "Air Force",     slug: "air",           speed: 3.0, attack: 30,  defense: 10, goldUpkeep: 5,  goldCost: 500,  steelCost: 100,  trainTimeSec: 600,  requiresTech: null,          sortOrder: 3 },
    { name: "Artillery",     slug: "artillery",     speed: 0.5, attack: 50,  defense: 5,  goldUpkeep: 4,  goldCost: 300,  steelCost: 75,   trainTimeSec: 450,  requiresTech: null,          sortOrder: 4 },
    { name: "Interceptor",   slug: "interceptor",   speed: 5.0, attack: 0,   defense: 0,  goldUpkeep: 3,  goldCost: 400,  steelCost: 50,   trainTimeSec: 480,  requiresTech: null,          sortOrder: 5 },
    { name: "Tactical Nuke", slug: "tactical-nuke", speed: 8.0, attack: 200, defense: 0,  goldUpkeep: 8,  goldCost: 2000, steelCost: 500,  trainTimeSec: 3600, requiresTech: "nuclear-program", sortOrder: 6 },
    { name: "ICBM",          slug: "icbm",          speed: 10.0,attack: 500, defense: 0,  goldUpkeep: 10, goldCost: 5000, steelCost: 1000, trainTimeSec: 7200, requiresTech: "nuclear-advanced", sortOrder: 7 },
  ];

  for (const ut of unitTypes) {
    await prisma.unitType.upsert({
      where: { slug: ut.slug },
      update: {},
      create: ut,
    });
  }
  console.log(`✓ UnitTypes: ${unitTypes.length} seeded`);

  // ── Tech Tree ────────────────────────────────────────────────────────────
  // Layer 1 — base techs (no prerequisites)
  const baseTechs = [
    { name: "Basic Military Doctrine", slug: "basic-military",  category: "MILITARY"  as const, description: "Increases unit attack by 10%.", goldCost: 500,   durationSecs: 1800,  bonusType: "attack_pct",       bonusValue: 0.10, sortOrder: 1 },
    { name: "Basic Economics",          slug: "basic-economy",   category: "ECONOMY"   as const, description: "Increases gold income by 15%.", goldCost: 500,   durationSecs: 1800,  bonusType: "gold_income_pct",  bonusValue: 0.15, sortOrder: 2 },
    { name: "Perimeter Defense",        slug: "basic-defense",   category: "DEFENSE"   as const, description: "Increases unit defense by 10%.", goldCost: 500,  durationSecs: 1800,  bonusType: "defense_pct",      bonusValue: 0.10, sortOrder: 3 },
    { name: "Intelligence Network",     slug: "basic-espionage", category: "ESPIONAGE" as const, description: "Unlocks 2 additional spy slots.", goldCost: 500,  durationSecs: 1800,  bonusType: "spy_slots",        bonusValue: 2,    sortOrder: 4 },
  ];

  const createdBase: Record<string, string> = {};
  for (const t of baseTechs) {
    const node = await prisma.techNode.upsert({
      where: { slug: t.slug },
      update: {},
      create: { ...t, prerequisiteId: null },
    });
    createdBase[t.slug] = node.id;
  }
  console.log(`✓ TechNodes Layer 1: ${baseTechs.length} seeded`);

  // Layer 2 — mid techs (require one layer-1 tech)
  const midTechs = [
    { name: "Advanced Warfare",    slug: "advanced-military",  category: "MILITARY"  as const, description: "Unlocks Armor units. +15% attack.",  goldCost: 2000,  durationSecs: 7200,  bonusType: "attack_pct",      bonusValue: 0.15, prereq: "basic-military"  },
    { name: "Nuclear Program",     slug: "nuclear-program",    category: "MILITARY"  as const, description: "Unlocks Tactical Nuke production.",   goldCost: 5000,  durationSecs: 28800, bonusType: "unlock_unit",     bonusValue: 0,    prereq: "advanced-military" },
    { name: "Market Efficiency",   slug: "market-efficiency",  category: "ECONOMY"   as const, description: "Reduces market tax to 3%.",           goldCost: 2000,  durationSecs: 7200,  bonusType: "market_tax_pct",  bonusValue: -0.02,prereq: "basic-economy"   },
    { name: "Missile Defense",     slug: "missile-defense",    category: "DEFENSE"   as const, description: "+20% intercept chance per unit.",     goldCost: 3000,  durationSecs: 14400, bonusType: "intercept_pct",   bonusValue: 0.20, prereq: "basic-defense"   },
    { name: "Counter-Intelligence",slug: "ci-network",         category: "ESPIONAGE" as const, description: "+25 CI rating.",                     goldCost: 2000,  durationSecs: 7200,  bonusType: "ci_rating",       bonusValue: 25,   prereq: "basic-espionage" },
  ];

  const createdMid: Record<string, string> = {};
  for (const t of midTechs) {
    const prereqId = createdBase[t.prereq];
    const node = await prisma.techNode.upsert({
      where: { slug: t.slug },
      update: {},
      create: {
        name: t.name, slug: t.slug, category: t.category,
        description: t.description, goldCost: t.goldCost,
        durationSecs: t.durationSecs, bonusType: t.bonusType,
        bonusValue: t.bonusValue, prerequisiteId: prereqId ?? null,
      },
    });
    createdMid[t.slug] = node.id;
  }
  console.log(`✓ TechNodes Layer 2: ${midTechs.length} seeded`);

  // Layer 3 — advanced techs
  const advancedTechs = [
    { name: "ICBM Technology",       slug: "nuclear-advanced",   category: "MILITARY"  as const, description: "Unlocks ICBM production.",           goldCost: 15000, durationSecs: 86400, bonusType: "unlock_unit",    bonusValue: 0,    prereq: "nuclear-program"  },
    { name: "Economic Dominance",    slug: "economic-dominance", category: "ECONOMY"   as const, description: "+30% gold income, +50% storage cap.", goldCost: 8000,  durationSecs: 43200, bonusType: "gold_income_pct",bonusValue: 0.30, prereq: "market-efficiency"},
    { name: "Shadow Network",        slug: "shadow-network",     category: "ESPIONAGE" as const, description: "+4 spy slots. Unlock misinformation.", goldCost: 6000, durationSecs: 28800, bonusType: "spy_slots",      bonusValue: 4,    prereq: "ci-network"       },
    { name: "Fortress Doctrine",     slug: "fortress-doctrine",  category: "DEFENSE"   as const, description: "+35% defense, enable fortifications.", goldCost: 8000, durationSecs: 43200, bonusType: "defense_pct",    bonusValue: 0.35, prereq: "missile-defense"  },
  ];

  for (const t of advancedTechs) {
    const prereqId = createdMid[t.prereq];
    await prisma.techNode.upsert({
      where: { slug: t.slug },
      update: {},
      create: {
        name: t.name, slug: t.slug, category: t.category,
        description: t.description, goldCost: t.goldCost,
        durationSecs: t.durationSecs, bonusType: t.bonusType,
        bonusValue: t.bonusValue, prerequisiteId: prereqId ?? null,
      },
    });
  }
  console.log(`✓ TechNodes Layer 3: ${advancedTechs.length} seeded`);
  console.log("\n✅ Seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
