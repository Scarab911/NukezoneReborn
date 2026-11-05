import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ResearchContent } from "./ResearchContent";
import { powerState } from "@/lib/power";
import { BUILDINGS } from "@/lib/game-constants";

export default async function ResearchPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const nation = await prisma.nation.findUnique({
    where:   { playerId: session.user.id },
    include: { resource: true, buildings: { select: { type: true, count: true } } },
  });
  if (!nation) redirect("/setup");

  const [techNodes, progress] = await Promise.all([
    prisma.techNode.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.researchProgress.findMany({ where: { nationId: nation.id } }),
  ]);

  const progressMap = Object.fromEntries(
    progress.map((p) => [p.techNodeId, {
      status:      p.status,
      startedAt:   p.startedAt.toISOString(),
      completesAt: p.completesAt.toISOString(),
    }]),
  );
  const labs  = nation.buildings.find((b) => b.type === "RESEARCH_LAB")?.count ?? 0;
  const power = powerState(nation.buildings);

  return (
    <ResearchContent
      gold={nation.resource?.money ?? 0}
      labs={labs}
      powerLevel={power.level}
      labSpeed={BUILDINGS.RESEARCH_LAB_SPEED}
      techNodes={techNodes.map((n) => ({
        id:            n.id,
        name:          n.name,
        slug:          n.slug,
        category:      n.category,
        description:   n.description,
        goldCost:      n.goldCost,
        durationSecs:  n.durationSecs,
        prerequisiteId: n.prerequisiteId,
        bonusType:     n.bonusType,
        bonusValue:    n.bonusValue,
        sortOrder:     n.sortOrder,
      }))}
      progressMap={progressMap}
    />
  );
}
