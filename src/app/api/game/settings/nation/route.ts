import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const Schema = z.object({
  nationName: z.string().min(2).max(32).trim().optional(),
  color:      z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { nationName, color } = parsed.data;
  if (!nationName && !color) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const nation = await prisma.nation.findUnique({ where: { playerId: session.user.id } });
  if (!nation) return NextResponse.json({ error: "No nation" }, { status: 404 });

  if (nationName && nationName !== nation.name) {
    const taken = await prisma.nation.findFirst({ where: { name: nationName, worldId: "world_01" } });
    if (taken) return NextResponse.json({ error: "Name already taken" }, { status: 409 });
  }

  await prisma.nation.update({
    where: { id: nation.id },
    data:  { ...(nationName && { name: nationName }), ...(color && { color }) },
  });

  return NextResponse.json({ success: true });
}
