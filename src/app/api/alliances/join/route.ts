import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const Schema = z.object({ allianceId: z.string().cuid() });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { allianceId } = parsed.data;

  const nation = await prisma.nation.findUnique({
    where:   { playerId: session.user.id },
    include: { allianceMember: true },
  });
  if (!nation)               return NextResponse.json({ error: "No nation" },              { status: 404 });
  if (nation.allianceMember) return NextResponse.json({ error: "Already in an alliance" }, { status: 409 });

  const alliance = await prisma.alliance.findFirst({
    where: { id: allianceId, status: "ACTIVE" },
    include: { _count: { select: { members: true } } },
  });
  if (!alliance) return NextResponse.json({ error: "Alliance not found" }, { status: 404 });
  if (alliance._count.members >= 50) return NextResponse.json({ error: "Alliance is full" }, { status: 400 });

  await prisma.allianceMember.create({
    data: { allianceId, nationId: nation.id, role: "MEMBER" },
  });

  return NextResponse.json({ success: true });
}
