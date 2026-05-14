import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { RankingsContent } from "./RankingsContent";

export default async function RankingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const myNation = await prisma.nation.findUnique({
    where:  { playerId: session.user.id },
    select: { id: true },
  });

  const nations = await prisma.nation.findMany({
    where:   { worldId: "world_01", status: { in: ["ACTIVE", "PROTECTED"] } },
    select:  {
      id: true, name: true, status: true, color: true,
      hp: true, maxHp: true, totalUnits: true,
      morale:   { select: { morale:  true } },
      resource: { select: { gold:    true } },
      _count:   { select: { attackingBattles: true } },
    },
    orderBy: { totalUnits: "desc" },
    take: 100,
  });

  // Power score: units×10 + (hp/maxHp)×500
  const ranked = nations
    .map((n) => ({
      id:         n.id,
      name:       n.name,
      status:     n.status,
      color:      n.color,
      hp:         n.hp,
      maxHp:      n.maxHp,
      totalUnits: n.totalUnits,
      morale:     n.morale?.morale ?? 75,
      gold:       n.resource?.gold  ?? 0,
      battles:    n._count.attackingBattles,
      isOwn:      n.id === myNation?.id,
      score:      n.totalUnits * 10 + Math.round((n.hp / Math.max(1, n.maxHp)) * 500),
    }))
    .sort((a, b) => b.score - a.score)
    .map((n, i) => ({ ...n, rank: i + 1 }));

  return <RankingsContent nations={ranked} />;
}
