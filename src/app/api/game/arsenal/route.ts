import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const nation = await prisma.nation.findUnique({ where: { playerId: session.user.id } });
  if (!nation) return NextResponse.json({ error: "No nation" }, { status: 404 });

  const [armies, unitTypes, trainingQueue] = await Promise.all([
    prisma.army.findMany({
      where:   { nationId: nation.id },
      include: { units: { include: { unitType: true } } },
    }),
    prisma.unitType.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.unitTraining.findMany({
      where:   { nationId: nation.id, completesAt: { gt: new Date() } },
      orderBy: { completesAt: "asc" },
    }),
  ]);

  return NextResponse.json({ armies, unitTypes, trainingQueue });
}
