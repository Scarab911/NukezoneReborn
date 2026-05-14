import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const nation = await prisma.nation.findUnique({ where: { playerId: session.user.id } });
  if (!nation) return NextResponse.json({ error: "No nation" }, { status: 404 });

  const [techNodes, progress] = await Promise.all([
    prisma.techNode.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.researchProgress.findMany({ where: { nationId: nation.id } }),
  ]);

  return NextResponse.json({ techNodes, progress });
}
