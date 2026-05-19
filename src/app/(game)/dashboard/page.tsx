import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { syncTurns, minutesToNextTurn } from "@/server/game-engine/turns";
import { DashboardContent } from "./DashboardContent";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await prisma.nation.findUnique({ where: { playerId: session.user.id } })
    .then((n) => n && syncTurns(n.id));

  const nation = await prisma.nation.findUnique({
    where: { playerId: session.user.id },
    include: {
      resource: true,
      morale:   true,
      _count:   { select: { armies: true, spyUnits: true, attackingBattles: true } },
    },
  });

  if (!nation) redirect("/setup");

  const minsToNext = minutesToNextTurn(nation.turnsRegenAt);

  return (
    <DashboardContent
      nation={{
        name:      nation.name,
        status:    nation.status,
        turns:     nation.turns,
        maxTurns:  nation.maxTurns,
        totalUnits: nation.totalUnits,
        minsToNextTurn: minsToNext,
        armies:    nation._count.armies,
        spyUnits:  nation._count.spyUnits,
        battles:   nation._count.attackingBattles,
        explorationCount: nation.explorationCount ?? 0,
      }}
      morale={nation.morale?.morale ?? 75}
      resources={{
        money:      nation.resource?.money      ?? 0,
        land:       nation.resource?.land       ?? 0,
        population: nation.resource?.population ?? 0,
        energy:     nation.resource?.energy     ?? 0,
      }}
    />
  );
}
