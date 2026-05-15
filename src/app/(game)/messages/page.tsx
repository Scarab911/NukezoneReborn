import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MessagesContent } from "./MessagesContent";

export default async function MessagesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const nation = await prisma.nation.findUnique({ where: { playerId: session.user.id } });
  if (!nation) redirect("/setup");

  const [notifications, nations] = await Promise.all([
    prisma.notification.findMany({
      where:   { nationId: nation.id },
      orderBy: { createdAt: "desc" },
      take:    50,
    }),
    prisma.nation.findMany({
      where:   { worldId: "world_01", status: { in: ["ACTIVE", "PROTECTED"] }, NOT: { id: nation.id } },
      select:  { id: true, name: true, color: true },
      orderBy: { name: "asc" },
      take:    50,
    }),
  ]);

  // Mark as read
  await prisma.notification.updateMany({
    where: { nationId: nation.id, read: false },
    data:  { read: true },
  });

  return (
    <MessagesContent
      myNationName={nation.name}
      notifications={notifications.map((n) => ({
        id:        n.id,
        type:      n.type,
        payload:   n.payload as Record<string, string>,
        read:      n.read,
        createdAt: n.createdAt.toISOString(),
      }))}
      nations={nations}
    />
  );
}
