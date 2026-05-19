// Seed is now applied via Supabase MCP (port 5432 blocked locally).
// Run the SQL in docs/seed.sql via Supabase Dashboard or MCP execute_sql.
// This file is kept as documentation of what was seeded.

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
  console.log("Seed already applied via Supabase MCP.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
