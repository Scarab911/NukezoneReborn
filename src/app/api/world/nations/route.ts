import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const myNation = await prisma.nation.findUnique({
    where:  { playerId: session.user.id },
    select: { id: true },
  });

  const nations = await prisma.nation.findMany({
    where:   { worldId: "world_01", status: { in: ["ACTIVE", "PROTECTED"] } },
    select:  { id: true, name: true, color: true, status: true, totalUnits: true },
    orderBy: { totalUnits: "desc" },
    take:    100,
  });

  return NextResponse.json({
    nations: nations.map((n) => ({ ...n, isOwn: n.id === myNation?.id })),
  });
}
