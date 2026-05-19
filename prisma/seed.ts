// Seed is applied via Supabase MCP (port 5432 blocked locally).
// This file documents the current seeded state — run via MCP execute_sql if reset needed.
//
// Current unit roster (18 units, applied 2026-05-19):
//
// GROUND (6):
//   ranger-squad        ATK 15  DEF 12  Cost  500  Upkeep  5  — light infantry, fast
//   spear-team          ATK 20  DEF 18  Cost  800  Upkeep  8  — anti-armor infantry
//   ghost-operators     ATK 35  DEF 20  Cost 1800  Upkeep 15  — spec-ops, counters infantry
//   titan-apc           ATK 40  DEF 55  Cost 2200  Upkeep 20  — armored troop carrier
//   titan-mbt           ATK 110 DEF 130 Cost 5000  Upkeep 45  — main battle tank
//   storm-artillery     ATK 90  DEF 25  Cost 4000  Upkeep 35  — long-range bombardment
//
// AIR (3):
//   viper-gunship       ATK 80  DEF 45  Cost 3500  Upkeep 30  — anti-armor helicopter
//   predator-drone-swarm ATK 55 DEF 30  Cost 2500  Upkeep 22  — recon+strike drones
//   strike-jet-squadron ATK 130 DEF 60  Cost 6500  Upkeep 55  — air superiority jets
//
// SEA (3):
//   leviathan-destroyer ATK 100 DEF 90  Cost 8000  Upkeep 70  — AA + surface combat
//   phantom-submarine   ATK 120 DEF 50  Cost 9000  Upkeep 75  — stealth torpedo attacks
//   atlas-carrier       ATK 60  DEF 120 Cost 12000 Upkeep 100 — naval command + air ops
//
// SPECIAL (2):
//   shadow-cell         ATK 70  DEF 40  Cost 4500  Upkeep 38  — sabotage ops
//   stealth-raider-wing ATK 95  DEF 55  Cost 7000  Upkeep 60  — precision strikes
//
// STRATEGIC (4):
//   emp-missile         ATK 200 DEF  0  Cost 20000 Upkeep  0  — disables electronics
//   chemical-missile    ATK 280 DEF  0  Cost 25000 Upkeep  0  — area denial
//   biochemical-missile ATK 350 DEF  0  Cost 30000 Upkeep  0  — mass casualties
//   nuclear-missile     ATK 500 DEF  0  Cost 50000 Upkeep  0  — total annihilation

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { configDotenv } from "dotenv";
import path from "node:path";

configDotenv({ path: path.resolve(process.cwd(), ".env.local") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter });

async function main() {
  console.log("Verifying seed data...");

  const worldCount = await prisma.gameWorld.count();
  const unitCount  = await prisma.unitType.count();
  const techCount  = await prisma.techNode.count();

  console.log(`GameWorlds: ${worldCount}, UnitTypes: ${unitCount}, TechNodes: ${techCount}`);
  if (unitCount !== 18) {
    console.warn(`Expected 18 unit types, got ${unitCount}. Re-apply seed SQL via Supabase MCP.`);
  } else {
    console.log("Seed OK.");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
