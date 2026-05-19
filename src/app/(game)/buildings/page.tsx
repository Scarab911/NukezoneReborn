import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BuildingsContent } from "./BuildingsContent";
import { BUILDINGS } from "@/lib/game-constants";

export default async function BuildingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const nation = await prisma.nation.findUnique({
    where:   { playerId: session.user.id },
    include: { resource: true, buildings: true },
  });
  if (!nation) redirect("/setup");

  const BUILDING_DEFS = [
    {
      type:    "WAR_FACTORY"    as const,
      label:   "War Factory",
      emoji:   "🏭",
      effect:  "+5% ground unit attack per building",
      moneyCost: BUILDINGS.MONEY_COST.WAR_FACTORY,
    },
    {
      type:    "AIRFIELD"       as const,
      label:   "Airfield",
      emoji:   "✈️",
      effect:  "+5% air unit attack per building",
      moneyCost: BUILDINGS.MONEY_COST.AIRFIELD,
    },
    {
      type:    "SHIPYARD"       as const,
      label:   "Shipyard",
      emoji:   "⚓",
      effect:  "+5% sea unit attack per building",
      moneyCost: BUILDINGS.MONEY_COST.SHIPYARD,
    },
    {
      type:    "RESEARCH_LAB"   as const,
      label:   "Research Lab",
      emoji:   "🔬",
      effect:  "+10% research speed per building",
      moneyCost: BUILDINGS.MONEY_COST.RESEARCH_LAB,
    },
    {
      type:    "POWER_PLANT"    as const,
      label:   "Power Plant",
      emoji:   "⚡",
      effect:  "+50 energy per building",
      moneyCost: BUILDINGS.MONEY_COST.POWER_PLANT,
    },
    {
      type:    "MISSILE_SILO"   as const,
      label:   "Missile Silo",
      emoji:   "🚀",
      effect:  "+1 strategic weapon slot per silo",
      moneyCost: BUILDINGS.MONEY_COST.MISSILE_SILO,
    },
    {
      type:    "DEFENSE_TOWERS" as const,
      label:   "Defense Towers",
      emoji:   "🛡️",
      effect:  "+8% defense per building",
      moneyCost: BUILDINGS.MONEY_COST.DEFENSE_TOWERS,
    },
  ];

  const counts = Object.fromEntries(
    nation.buildings.map((b) => [b.type, b.count]),
  );

  return (
    <BuildingsContent
      money={nation.resource?.money ?? 0}
      land={nation.resource?.land   ?? 0}
      turns={nation.turns}
      buildings={BUILDING_DEFS.map((d) => ({
        ...d,
        count:     counts[d.type] ?? 0,
        landCost:  BUILDINGS.LAND_PER_BUILDING,
        maxCount:  BUILDINGS.MAX_PER_TYPE,
        turnCost:  2,
      }))}
    />
  );
}
