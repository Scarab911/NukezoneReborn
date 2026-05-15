import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const nation = await prisma.nation.findUnique({ where: { playerId: session.user.id } });
  if (!nation) return NextResponse.json({ notifications: [] });

  const notifications = await prisma.notification.findMany({
    where:   { nationId: nation.id },
    orderBy: { createdAt: "desc" },
    take:    50,
  });

  // Mark all as read
  await prisma.notification.updateMany({
    where: { nationId: nation.id, read: false },
    data:  { read: true },
  });

  return NextResponse.json({
    notifications: notifications.map((n) => ({
      id:        n.id,
      type:      n.type,
      payload:   n.payload,
      read:      n.read,
      createdAt: n.createdAt.toISOString(),
    })),
  });
}

const SendSchema = z.object({
  targetNationId: z.string().cuid(),
  message:        z.string().min(1).max(500).trim(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await req.json();
  const parsed = SendSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { targetNationId, message } = parsed.data;

  const senderNation = await prisma.nation.findUnique({ where: { playerId: session.user.id } });
  if (!senderNation) return NextResponse.json({ error: "No nation" }, { status: 404 });

  const targetNation = await prisma.nation.findUnique({ where: { id: targetNationId } });
  if (!targetNation) return NextResponse.json({ error: "Target not found" }, { status: 404 });

  await prisma.notification.create({
    data: {
      nationId: targetNationId,
      type:     "DIPLOMACY_PROPOSAL",
      payload:  { from: senderNation.name, fromId: senderNation.id, message },
    },
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
