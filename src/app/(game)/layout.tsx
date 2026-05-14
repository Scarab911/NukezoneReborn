import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GameSidebar } from "@/components/layout/GameSidebar";
import { TopBar } from "@/components/layout/TopBar";
import { AlertBar } from "@/components/game/AlertBar";

export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Redirect to setup if player has no nation yet
  const nation = await prisma.nation.findUnique({
    where: { playerId: session.user.id },
    include: { resource: true },
  });

  const isSetupRoute = false; // Setup page lives outside (game) group

  if (!nation && !isSetupRoute) {
    redirect("/setup");
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <GameSidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          nationName={nation?.name}
          gold={nation?.resource?.gold}
          food={nation?.resource?.food}
          steel={nation?.resource?.steel}
          energy={nation?.resource?.energy}
        />
        <AlertBar />

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
