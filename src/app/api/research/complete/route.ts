// Dev-mode auto-completion endpoint.
// In production this is replaced by a BullMQ delayed job.
// Called on research page load — marks any expired IN_PROGRESS research as COMPLETED.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const nation = await prisma.nation.findUnique({ where: { playerId: session.user.id } });
  if (!nation) return NextResponse.json({ completed: [] });

  const expired = await prisma.researchProgress.findMany({
    where: {
      nationId:   nation.id,
      status:     "IN_PROGRESS",
      completesAt: { lte: new Date() },
    },
    include: { techNode: true },
  });

  if (expired.length === 0) return NextResponse.json({ completed: [] });

  await prisma.researchProgress.updateMany({
    where: { id: { in: expired.map((r) => r.id) } },
    data:  { status: "COMPLETED" },
  });

  return NextResponse.json({
    completed: expired.map((r) => ({
      techNodeId: r.techNodeId,
      name:       r.techNode.name,
    })),
  });
}
