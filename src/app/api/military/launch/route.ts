import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const LaunchSchema = z.object({
  targetNationId: z.string().cuid(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await req.json();
  const parsed = LaunchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { targetNationId } = parsed.data;

  const [attackerNation, defenderNation] = await Promise.all([
    prisma.nation.findUnique({
      where:   { playerId: session.user.id },
      include: { armies: { include: { units: true } } },
    }),
    prisma.nation.findUnique({ where: { id: targetNationId } }),
  ]);

  if (!attackerNation) return NextResponse.json({ error: "No nation"            }, { status: 404 });
  if (!defenderNation) return NextResponse.json({ error: "Target not found"     }, { status: 404 });
  if (attackerNation.id === targetNationId) return NextResponse.json({ error: "Cannot attack yourself" }, { status: 400 });
  if (defenderNation.status === "PROTECTED") return NextResponse.json({ error: "Target is protected" }, { status: 403 });

  const totalUnits = attackerNation.armies.reduce(
    (sum, a) => sum + a.units.reduce((s, u) => s + u.quantity, 0), 0,
  );
  if (totalUnits === 0) return NextResponse.json({ error: "No units to attack with" }, { status: 400 });

  // Travel time: 30s base for MVP (full distance calc comes in M4)
  const travelMs   = 30_000;
  const eta        = new Date(Date.now() + travelMs);
  const seed       = Math.abs(
    (attackerNation.id + defenderNation.id + Date.now())
      .split("").reduce((acc, c) => (acc << 5) - acc + c.charCodeAt(0), 0),
  );

  const army = attackerNation.armies[0];
  if (!army) return NextResponse.json({ error: "No army found" }, { status: 400 });

  const battle = await prisma.$transaction(async (tx) => {
    const b = await tx.battle.create({
      data: {
        worldId:         "world_01",
        attackerNationId: attackerNation.id,
        defenderNationId: targetNationId,
        status:          "PENDING",
        type:            "CONVENTIONAL",
        seed,
      },
    });

    await tx.armyMovement.create({
      data: {
        worldId:         "world_01",
        armyId:          army.id,
        attackerNationId: attackerNation.id,
        targetNationId,
        status:          "MOVING",
        eta,
        battleId:        b.id,
      },
    });

    return b;
  });

  return NextResponse.json({ success: true, battleId: battle.id, eta: eta.toISOString() }, { status: 201 });
}
