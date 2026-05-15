import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const CreateSchema = z.object({
  name: z.string().min(3).max(32).trim(),
  tag:  z.string().min(2).max(6).trim().toUpperCase(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const alliances = await prisma.alliance.findMany({
    where:   { worldId: "world_01", status: "ACTIVE" },
    include: { members: { include: { nation: { select: { id: true, name: true, color: true, totalUnits: true } } } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ alliances });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { name, tag } = parsed.data;

  const nation = await prisma.nation.findUnique({
    where:   { playerId: session.user.id },
    include: { allianceMember: true },
  });
  if (!nation)               return NextResponse.json({ error: "No nation" },              { status: 404 });
  if (nation.allianceMember) return NextResponse.json({ error: "Already in an alliance" }, { status: 409 });

  const existing = await prisma.alliance.findFirst({ where: { worldId: "world_01", name } });
  if (existing) return NextResponse.json({ error: "Alliance name taken" }, { status: 409 });

  const alliance = await prisma.$transaction(async (tx) => {
    const a = await tx.alliance.create({
      data: { worldId: "world_01", name, tag, status: "ACTIVE" },
    });
    await tx.allianceMember.create({
      data: { allianceId: a.id, nationId: nation.id, role: "LEADER" },
    });
    await tx.allianceTreasury.create({
      data: { allianceId: a.id, gold: 0 },
    });
    return a;
  });

  return NextResponse.json({ success: true, allianceId: alliance.id }, { status: 201 });
}
