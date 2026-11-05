// Research effects — completed techs' bonuses and the research-lab speed-up.
import { prisma } from "@/lib/db";
import { sumTechBonuses, type TechBonuses } from "@/lib/tech-bonus";
import type { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Research that counts as done: COMPLETED, or IN_PROGRESS whose time has run out
 * (status is only flipped when the research page is opened).
 */
export function finishedResearchWhere(nationId: string, now = new Date()): Prisma.ResearchProgressWhereInput {
  return {
    nationId,
    OR: [
      { status: "COMPLETED" },
      { status: "IN_PROGRESS", completesAt: { lte: now } },
    ],
  };
}

/** Summed bonuses of a nation's finished research. */
export async function getTechBonuses(db: Db, nationId: string): Promise<TechBonuses> {
  const done = await db.researchProgress.findMany({
    where:  finishedResearchWhere(nationId),
    select: { techNode: { select: { bonusType: true, bonusValue: true } } },
  });
  return sumTechBonuses(done.map((d) => d.techNode));
}
