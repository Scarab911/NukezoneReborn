import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const CreateOrderSchema = z.object({
  side:        z.enum(["BUY", "SELL"]),
  resource:    z.enum(["GOLD", "STEEL", "FOOD", "ENERGY"]),
  quantity:    z.number().int().min(10).max(10_000),
  pricePerUnit: z.number().int().min(1).max(100_000),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const nation = await prisma.nation.findUnique({
    where:   { playerId: session.user.id },
    include: { resource: true },
  });
  if (!nation) return NextResponse.json({ error: "No nation" }, { status: 404 });

  const [openOrders, myOrders] = await Promise.all([
    prisma.marketOrder.findMany({
      where:   { worldId: "world_01", status: { in: ["OPEN", "PARTIAL"] } },
      orderBy: [{ side: "asc" }, { pricePerUnit: "asc" }, { createdAt: "asc" }],
      take:    50,
    }),
    prisma.marketOrder.findMany({
      where:   { nationId: nation.id, status: { in: ["OPEN", "PARTIAL"] } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    openOrders,
    myOrders,
    resources: {
      gold:   nation.resource?.gold   ?? 0,
      steel:  nation.resource?.steel  ?? 0,
      food:   nation.resource?.food   ?? 0,
      energy: nation.resource?.energy ?? 0,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await req.json();
  const parsed = CreateOrderSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { side, resource, quantity, pricePerUnit } = parsed.data;

  const nation = await prisma.nation.findUnique({
    where:   { playerId: session.user.id },
    include: { resource: true },
  });
  if (!nation) return NextResponse.json({ error: "No nation" }, { status: 404 });

  // Check open order limit
  const openCount = await prisma.marketOrder.count({
    where: { nationId: nation.id, status: { in: ["OPEN", "PARTIAL"] } },
  });
  if (openCount >= 10) return NextResponse.json({ error: "Max 10 open orders" }, { status: 400 });

  // For sell orders: lock the resource
  if (side === "SELL") {
    const resourceField2 = resource.toLowerCase() as "gold" | "steel" | "food" | "energy";
    const available = nation.resource?.[resourceField2] ?? 0;
    if (available < quantity) return NextResponse.json({ error: `Not enough ${resource.toLowerCase()}` }, { status: 400 });

    const resourceField = resource.toLowerCase() as "gold" | "steel" | "food" | "energy";
    await prisma.$transaction([
      prisma.resource.update({
        where: { nationId: nation.id },
        data:  { [resourceField]: { decrement: quantity } },
      }),
      prisma.marketOrder.create({
        data: { nationId: nation.id, worldId: "world_01", side, resource, quantity, pricePerUnit },
      }),
    ]);
  } else {
    // For buy orders: lock the gold
    const totalCost = quantity * pricePerUnit;
    if ((nation.resource?.gold ?? 0) < totalCost) return NextResponse.json({ error: "Not enough gold" }, { status: 400 });

    await prisma.$transaction([
      prisma.resource.update({
        where: { nationId: nation.id },
        data:  { gold: { decrement: totalCost } },
      }),
      prisma.marketOrder.create({
        data: { nationId: nation.id, worldId: "world_01", side, resource, quantity, pricePerUnit },
      }),
    ]);
  }

  return NextResponse.json({ success: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("id");
  if (!orderId) return NextResponse.json({ error: "Missing order id" }, { status: 400 });

  const nation = await prisma.nation.findUnique({ where: { playerId: session.user.id } });
  if (!nation) return NextResponse.json({ error: "No nation" }, { status: 404 });

  const order = await prisma.marketOrder.findFirst({
    where: { id: orderId, nationId: nation.id, status: { in: ["OPEN", "PARTIAL"] } },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  // Refund unfilled portion (minus 1% cancel fee)
  const unfilledQty  = order.quantity - order.filledQty;
  const refundAmount = Math.floor(
    order.side === "SELL"
      ? 0 // seller gets their resource back
      : unfilledQty * order.pricePerUnit * 0.99, // buyer gets gold back minus fee
  );

  const resourceField = order.resource.toLowerCase() as "gold" | "steel" | "food" | "energy";

  await prisma.$transaction([
    prisma.marketOrder.update({ where: { id: orderId }, data: { status: "CANCELLED" } }),
    order.side === "SELL"
      ? prisma.resource.update({ where: { nationId: nation.id }, data: { [resourceField]: { increment: unfilledQty } } })
      : prisma.resource.update({ where: { nationId: nation.id }, data: { gold: { increment: refundAmount } } }),
  ]);

  return NextResponse.json({ success: true });
}
