import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { ENCLAVE } from "@/lib/game-constants";
import { syncTurns } from "@/server/game-engine/turns";
import { foundEnclave } from "@/server/services/nation.service";

const CreateNationSchema = z.object({
  nationName: z.string().trim().min(ENCLAVE.NAME_MIN).max(ENCLAVE.NAME_MAX),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const nation = await prisma.nation.findUnique({
    where:   { playerId: session.user.id },
    include: { resource: true, morale: true },
  });

  if (!nation) return NextResponse.json({ nation: null });

  // Sync turns on every fetch
  await syncTurns(nation.id);
  const fresh = await prisma.nation.findUniqueOrThrow({ where: { id: nation.id } });

  return NextResponse.json({ nation: { ...nation, turns: fresh.turns, turnsRegenAt: fresh.turnsRegenAt } });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await req.json();
  const parsed = CreateNationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const result = await foundEnclave(session.user.id, parsed.data.nationName);
  if (!result.ok) {
    return result.error === "NAME_TAKEN"
      ? NextResponse.json({ error: "Enclave name already taken." }, { status: 409 })
      : NextResponse.json({ error: "Enclave already exists." },     { status: 409 });
  }

  return NextResponse.json({ success: true, nationId: result.nationId }, { status: 201 });
}
