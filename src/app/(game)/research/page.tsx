import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ResearchContent } from "./ResearchContent";

export default async function ResearchPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const nation = await prisma.nation.findUnique({
    where:   { playerId: session.user.id },
    include: { resource: true },
  });
  if (!nation) redirect("/setup");

  const [techNodes, progress] = await Promise.all([
    prisma.techNode.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.researchProgress.findMany({ where: { nationId: nation.id } }),
  ]);

  const progressMap = Object.fromEntries(
    progress.map((p) => [p.techNodeId, { status: p.status, completesAt: p.completesAt?.toISOString() ?? null }]),
  );

  return (
    <ResearchContent
      gold={nation.resource?.gold ?? 0}
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
