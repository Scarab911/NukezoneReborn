import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ArsenalContent } from "./ArsenalContent";

export default async function ArsenalPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const nation = await prisma.nation.findUnique({
    where:   { playerId: session.user.id },
    include: { resource: true },
  });
  if (!nation) redirect("/setup");

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

  // Flatten owned units
  const ownedUnits: Record<string, number> = {};
  for (const army of armies) {
    for (const unit of army.units) {
      ownedUnits[unit.unitType.slug] = (ownedUnits[unit.unitType.slug] ?? 0) + unit.quantity;
    }
  }

  return (
    <ArsenalContent
      gold={nation.resource?.gold   ?? 0}
      steel={nation.resource?.steel ?? 0}
      ownedUnits={ownedUnits}
      unitTypes={unitTypes.map((u) => ({
        id:           u.id,
        name:         u.name,
        slug:         u.slug,
        attack:       u.attack,
        defense:      u.defense,
        speed:        u.speed,
        goldCost:     u.goldCost,
        steelCost:    u.steelCost,
        trainTimeSec: u.trainTimeSec,
        requiresTech: u.requiresTech,
      }))}
      trainingQueue={trainingQueue.map((t) => ({
        id:           t.id,
        unitTypeId:   t.unitTypeId,
        quantity:     t.quantity,
        completesAt:  t.completesAt.toISOString(),
      }))}
    />
  );
}
