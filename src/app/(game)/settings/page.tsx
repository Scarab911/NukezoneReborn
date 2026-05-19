import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SettingsContent } from "./SettingsContent";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const nation = await prisma.nation.findUnique({
    where:   { playerId: session.user.id },
    include: { resource: true },
  });
  if (!nation) redirect("/setup");

  const player = await prisma.player.findUniqueOrThrow({
    where:  { id: session.user.id },
    select: { email: true, name: true, createdAt: true },
  });

  return (
    <SettingsContent
      nationName={nation.name}
      nationColor={nation.color}
      nationStatus={nation.status}
      email={player.email}
      displayName={player.name ?? ""}
      memberSince={player.createdAt.toISOString()}
      land={nation.resource?.land ?? 0}
      totalUnits={nation.totalUnits}
    />
  );
}
