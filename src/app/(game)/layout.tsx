import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GameSidebar } from "@/components/layout/GameSidebar";
import { TopBar } from "@/components/layout/TopBar";
import { AlertBar } from "@/components/game/AlertBar";
import { syncTurns } from "@/server/game-engine/turns";

export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const nation = await prisma.nation.findUnique({
    where:   { playerId: session.user.id },
    include: { resource: true },
  });

  if (!nation) redirect("/setup");

  // Keep turns in sync on every game page load
  await syncTurns(nation.id);
  const fresh = await prisma.nation.findUniqueOrThrow({
    where:  { id: nation.id },
    select: { turns: true, maxTurns: true, turnsRegenAt: true },
  });

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <GameSidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          nationName={nation.name}
          money={nation.resource?.money}
          land={nation.resource?.land}
          population={nation.resource?.population}
          turns={fresh.turns}
          maxTurns={fresh.maxTurns}
        />
        <AlertBar />

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
