import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MilitaryContent } from "./MilitaryContent";

export default async function MilitaryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const nation = await prisma.nation.findUnique({
    where:   { playerId: session.user.id },
    include: {
      resource: true,
      armies:   { include: { units: { include: { unitType: true } } } },
    },
  });
  if (!nation) redirect("/setup");

  const targets = await prisma.nation.findMany({
    where:   { worldId: "world_01", status: "ACTIVE", NOT: { playerId: session.user.id } },
    select:  { id: true, name: true, color: true, totalUnits: true, status: true },
    orderBy: { name: "asc" },
    take:    50,
  });

  const totalUnits: Record<string, number> = {};
  for (const army of nation.armies) {
    for (const unit of army.units) {
      totalUnits[unit.unitType.name] = (totalUnits[unit.unitType.name] ?? 0) + unit.quantity;
    }
  }

  return (
    <MilitaryContent
      myNationId={nation.id}
      turns={nation.turns}
      totalUnits={totalUnits}
      targets={targets.map((t) => ({
        id:         t.id,
        name:       t.name,
        color:      t.color,
        totalUnits: t.totalUnits,
        status:     t.status,
      }))}
    />
  );
}
