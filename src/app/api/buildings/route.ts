import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { BuildingType } from "@prisma/client";
import { BUILDINGS } from "@/lib/game-constants";
import { buildBuildings, getBuildingsOverview } from "@/server/services/building.service";

const BuildSchema = z.object({
  type:  z.enum(BuildingType),
  count: z.number().int().min(1).max(BUILDINGS.MAX_PER_ORDER),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const overview = await getBuildingsOverview(session.user.id);
  if (!overview) return NextResponse.json({ error: "No enclave" }, { status: 404 });
  return NextResponse.json(overview);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await req.json().catch(() => null);
  const parsed = BuildSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await buildBuildings(session.user.id, parsed.data.type, parsed.data.count);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ success: true }, { status: 201 });
}
