import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { BuildingsContent, type BuildingDef } from "./BuildingsContent";
import { BUILDINGS, HOUSING, TURNS } from "@/lib/game-constants";
import { isHousingBuilding, listOverflows } from "@/lib/housing";
import { getBuildingsOverview } from "@/server/services/building.service";
import type { BuildingType } from "@prisma/client";

const DEFS: Array<{ type: BuildingType; label: string; emoji: string; effect: string; active: boolean }> = [
  { type: "BARRACKS",       label: "Barracks",       emoji: "🪖", active: true,  effect: `Houses ${HOUSING.CAPACITY.BARRACKS} space of infantry and special forces` },
  { type: "WAR_FACTORY",    label: "War Factory",    emoji: "🏭", active: true,  effect: `Houses ${HOUSING.CAPACITY.WAR_FACTORY} space of armored vehicles and artillery` },
  { type: "AIRFIELD",       label: "Airfield",       emoji: "✈️", active: true,  effect: `Houses ${HOUSING.CAPACITY.AIRFIELD} space of aircraft` },
  { type: "SHIPYARD",       label: "Shipyard",       emoji: "⚓", active: true,  effect: `Houses ${HOUSING.CAPACITY.SHIPYARD} space of naval vessels` },
  { type: "MISSILE_SILO",   label: "Missile Silo",   emoji: "🚀", active: true,  effect: `Houses ${HOUSING.CAPACITY.MISSILE_SILO} strategic missile` },
  { type: "DEFENSE_TOWERS", label: "Defense Towers", emoji: "🛡️", active: true,  effect: `+${BUILDINGS.DEFENSE_TOWER_BONUS * 100}% defense per tower` },
  { type: "RESEARCH_LAB",   label: "Research Lab",   emoji: "🔬", active: false, effect: "No effect yet — planned: faster research" },
  { type: "POWER_PLANT",    label: "Power Plant",    emoji: "⚡", active: false, effect: "No effect yet — planned: energy production" },
];

export default async function BuildingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const overview = await getBuildingsOverview(session.user.id);
  if (!overview) redirect("/setup");

  const buildings: BuildingDef[] = DEFS.map((d) => ({
    ...d,
    moneyCost: BUILDINGS.MONEY_COST[d.type],
    count:     overview.counts[d.type] ?? 0,
    housing:   isHousingBuilding(d.type)
      ? { used: overview.usage[d.type], capacity: overview.capacity[d.type] }
      : null,
  }));

  return (
    <BuildingsContent
      money={overview.money}
      land={overview.land}
      turns={overview.turns}
      landPerBuilding={BUILDINGS.LAND_PER_BUILDING}
      turnsPerBuilding={TURNS.BUILD_COST}
      maxPerOrder={BUILDINGS.MAX_PER_ORDER}
      buildings={buildings}
      overflows={listOverflows(overview.capacity, overview.usage, overview.deadlines)}
    />
  );
}
