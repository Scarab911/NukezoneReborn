import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DashboardContent } from "./DashboardContent";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const nation = await prisma.nation.findUnique({
    where: { playerId: session.user.id },
    include: {
      resource: true,
      morale:   true,
      _count:   { select: { armies: true, spyUnits: true } },
    },
  });

  if (!nation) redirect("/setup");

  // Pass only plain serialisable data to the Client Component
  return (
    <DashboardContent
      nation={{
        name:   nation.name,
        status: nation.status,
        hp:     nation.hp,
        maxHp:  nation.maxHp,
        armies: nation._count.armies,
        spyUnits: nation._count.spyUnits,
      }}
      morale={nation.morale?.morale ?? 75}
      resources={{
        gold:   nation.resource?.gold   ?? 0,
        food:   nation.resource?.food   ?? 0,
        steel:  nation.resource?.steel  ?? 0,
        energy: nation.resource?.energy ?? 0,
      }}
    />
  );
}
