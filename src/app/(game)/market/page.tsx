import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MarketContent } from "./MarketContent";

export default async function MarketPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const nation = await prisma.nation.findUnique({
    where:   { playerId: session.user.id },
    include: { resource: true },
  });
  if (!nation) redirect("/setup");

  const [openOrders, myOrders] = await Promise.all([
    prisma.marketOrder.findMany({
      where:   { worldId: "world_01", status: { in: ["OPEN", "PARTIAL"] } },
      orderBy: [{ side: "asc" }, { pricePerUnit: "asc" }],
      take:    50,
    }),
    prisma.marketOrder.findMany({
      where:   { nationId: nation.id, status: { in: ["OPEN", "PARTIAL"] } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <MarketContent
      resources={{
        gold:   nation.resource?.gold   ?? 0,
        steel:  nation.resource?.steel  ?? 0,
        food:   nation.resource?.food   ?? 0,
        energy: nation.resource?.energy ?? 0,
      }}
      openOrders={openOrders.map((o) => ({
        id: o.id, side: o.side, resource: o.resource,
        quantity: o.quantity, filledQty: o.filledQty,
        pricePerUnit: o.pricePerUnit,
        isOwn: o.nationId === nation.id,
      }))}
      myOrders={myOrders.map((o) => ({
        id: o.id, side: o.side, resource: o.resource,
        quantity: o.quantity, filledQty: o.filledQty,
        pricePerUnit: o.pricePerUnit,
        createdAt: o.createdAt.toISOString(),
      }))}
    />
  );
}
