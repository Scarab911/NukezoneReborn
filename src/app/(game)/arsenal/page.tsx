import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ArsenalContent } from "./ArsenalContent";
import { HOUSING_BUILDINGS, HOUSING_LABEL, housingFor, listOverflows } from "@/lib/housing";
import { getBuildingsOverview } from "@/server/services/building.service";

export default async function ArsenalPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const nation = await prisma.nation.findUnique({
    where:   { playerId: session.user.id },
    include: { resource: true },
  });
  if (!nation) redirect("/setup");

  // Applies any expired desertion first, so owned units and housing are current
  const overview = await getBuildingsOverview(session.user.id);
  if (!overview) redirect("/setup");

  const [unitTypes, armies, trainingQueue] = await Promise.all([
    prisma.unitType.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.army.findMany({
      where:   { nationId: nation.id },
      include: { units: { include: { unitType: true } } },
    }),
    prisma.unitTraining.findMany({
      where:   { nationId: nation.id, completesAt: { gt: new Date() } },
      orderBy: { completesAt: "asc" },
    }),
  ]);

  const ownedUnits: Record<string, number> = {};
  for (const army of armies) {
    for (const unit of army.units) {
      ownedUnits[unit.unitType.slug] = (ownedUnits[unit.unitType.slug] ?? 0) + unit.quantity;
    }
  }

  return (
    <ArsenalContent
      money={overview.money}
      turns={overview.turns}
      housing={HOUSING_BUILDINGS.map((b) => ({
        building: b,
        label:    HOUSING_LABEL[b],
        used:     overview.usage[b],
        capacity: overview.capacity[b],
      }))}
      overflows={listOverflows(overview.capacity, overview.usage, overview.deadlines)}
      ownedUnits={ownedUnits}
      unitTypes={unitTypes.map((u) => ({
        id:          u.id,
        name:        u.name,
        slug:        u.slug,
        category:    u.category,
        attack:      u.attack,
        defense:     u.defense,
        moneyCost:   u.moneyCost,
        upkeep:      u.upkeep,
        requiresTech: u.requiresTech,
        sortOrder:   u.sortOrder,
        housing:     housingFor(u.slug),
      }))}
      trainingQueue={trainingQueue.map((t) => ({
        id:          t.id,
        unitTypeId:  t.unitTypeId,
        quantity:    t.quantity,
        completesAt: t.completesAt.toISOString(),
      }))}
    />
  );
}
