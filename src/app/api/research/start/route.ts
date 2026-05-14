import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const Schema = z.object({ techNodeId: z.string().cuid() });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { techNodeId } = parsed.data;

  const [nation, techNode] = await Promise.all([
    prisma.nation.findUnique({ where: { playerId: session.user.id }, include: { resource: true } }),
    prisma.techNode.findUnique({ where: { id: techNodeId } }),
  ]);

  if (!nation)   return NextResponse.json({ error: "No nation"    }, { status: 404 });
  if (!techNode) return NextResponse.json({ error: "Unknown tech" }, { status: 404 });

  // Check already researched or in progress
  const existing = await prisma.researchProgress.findFirst({
    where: { nationId: nation.id, techNodeId },
  });
  if (existing?.status === "COMPLETED")   return NextResponse.json({ error: "Already researched" }, { status: 409 });
  if (existing?.status === "IN_PROGRESS") return NextResponse.json({ error: "Already in progress" }, { status: 409 });

  // Check prerequisite
  if (techNode.prerequisiteId) {
    const prereqDone = await prisma.researchProgress.findFirst({
      where: { nationId: nation.id, techNodeId: techNode.prerequisiteId, status: "COMPLETED" },
    });
    if (!prereqDone) return NextResponse.json({ error: "Prerequisite not researched" }, { status: 403 });
  }

  // Check only one active research at a time
  const active = await prisma.researchProgress.findFirst({
    where: { nationId: nation.id, status: "IN_PROGRESS" },
  });
  if (active) return NextResponse.json({ error: "Research already in progress" }, { status: 409 });

  if ((nation.resource?.gold ?? 0) < techNode.goldCost) {
    return NextResponse.json({ error: "Not enough gold" }, { status: 400 });
  }

  const completesAt = new Date(Date.now() + techNode.durationSecs * 1000);

  await prisma.$transaction([
    prisma.resource.update({
      where: { nationId: nation.id },
      data:  { gold: { decrement: techNode.goldCost } },
    }),
    prisma.researchProgress.create({
      data: { nationId: nation.id, techNodeId, completesAt },
    }),
  ]);

  return NextResponse.json({ success: true, completesAt }, { status: 201 });
}
