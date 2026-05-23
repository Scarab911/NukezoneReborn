import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { syncTurns } from "@/server/game-engine/turns";
import { MilitaryContent } from "./MilitaryContent";

export default async function MilitaryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const me = await prisma.nation.findUnique({
    where:   { playerId: session.user.id },
    include: {
      resource: true,
      armies:   { include: { units: { include: { unitType: true } } } },
    },
  });
  if (!me) redirect("/setup");

  await syncTurns(me.id);
  const fresh = await prisma.nation.findUniqueOrThrow({
    where:  { id: me.id },
    select: { turns: true },
  });

  const targets = await prisma.nation.findMany({
    where:  { worldId: "world_01", status: { in: ["ACTIVE", "PROTECTED"] }, NOT: { id: me.id } },
    select: {
      id:         true,
      name:       true,
      color:      true,
      totalUnits: true,
      status:     true,
      resource:   { select: { land: true } },
    },
    orderBy: { totalUnits: "desc" },
    take:    100,
  });

  const myPower = me.totalUnits * 10 + (me.resource?.land ?? 0) * 5;

  const totalUnits: Record<string, number> = {};
  for (const army of me.armies) {
    for (const unit of army.units) {
      totalUnits[unit.unitType.name] = (totalUnits[unit.unitType.name] ?? 0) + unit.quantity;
    }
  }

  return (
    <MilitaryContent
      myNationId={me.id}
      myPower={myPower}
      myTotalUnits={me.totalUnits}
      turns={fresh.turns}
      totalUnits={totalUnits}
      targets={targets.map((t) => ({
        id:         t.id,
        name:       t.name,
        color:      t.color,
        totalUnits: t.totalUnits,
        land:       t.resource?.land ?? 0,
        power:      t.totalUnits * 10 + (t.resource?.land ?? 0) * 5,
        status:     t.status,
      }))}
    />
  );
}
