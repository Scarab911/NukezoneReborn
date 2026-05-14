import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { STARTING } from "@/lib/game-constants";

const CreateNationSchema = z.object({
  nationName: z.string().min(2).max(32).trim(),
  color:      z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#22c55e"),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const nation = await prisma.nation.findUnique({
    where: { playerId: session.user.id },
    include: { resource: true, morale: true },
  });

  if (!nation) return NextResponse.json({ nation: null });
  return NextResponse.json({ nation });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // One nation per player
  const existing = await prisma.nation.findUnique({ where: { playerId: session.user.id } });
  if (existing) return NextResponse.json({ error: "Nation already exists." }, { status: 409 });

  const body: unknown = await req.json();
  const parsed = CreateNationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { nationName, color } = parsed.data;

  // Check name uniqueness within world
  const nameTaken = await prisma.nation.findFirst({
    where: { name: nationName, worldId: "world_01" },
  });
  if (nameTaken) return NextResponse.json({ error: "Nation name already taken." }, { status: 409 });

  // Create nation + all dependent records atomically
  const nation = await prisma.$transaction(async (tx) => {
    const n = await tx.nation.create({
      data: {
        worldId:  "world_01",
        playerId: session.user!.id,
        name:     nationName,
        color,
        hp:       STARTING.HP,
        maxHp:    STARTING.HP,
        status:   "PROTECTED",
      },
    });

    await tx.resource.create({
      data: {
        nationId: n.id,
        gold:     STARTING.GOLD,
        food:     STARTING.FOOD,
        steel:    STARTING.STEEL,
        energy:   STARTING.ENERGY,
      },
    });

    await tx.moraleRecord.create({
      data: { nationId: n.id, morale: STARTING.MORALE },
    });

    await tx.bankAccount.create({
      data: { nationId: n.id, balance: 0 },
    });

    await tx.cIRating.create({
      data: { nationId: n.id, rating: 10 },
    });

    // Default stationed army
    await tx.army.create({
      data: { nationId: n.id, name: "Home Guard", status: "STATIONED" },
    });

    return n;
  });

  return NextResponse.json({ success: true, nationId: nation.id }, { status: 201 });
}
