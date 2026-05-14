import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArsenalTrainForm } from "./ArsenalTrainForm";

export default async function ArsenalPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const nation = await prisma.nation.findUnique({
    where: { playerId: session.user.id },
    include: { resource: true },
  });
  if (!nation) redirect("/setup");

  const [unitTypes, armies, trainingQueue] = await Promise.all([
    prisma.unitType.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.army.findMany({
      where:   { nationId: nation.id },
      include: { units: { include: { unitType: true } } },
    }),
    prisma.unitTraining.findMany({
      where:   { nationId: nation.id, completesAt: { gt: new Date() } },
      orderBy: { completesAt: "asc" },
    }),
  ]);

  // Flatten owned units for display
  const ownedUnits: Record<string, number> = {};
  for (const army of armies) {
    for (const unit of army.units) {
      ownedUnits[unit.unitType.slug] = (ownedUnits[unit.unitType.slug] ?? 0) + unit.quantity;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Arsenal</h1>
        <p className="text-slate-500 text-sm mt-0.5">Train and manage your military units</p>
      </div>

      {/* Resource reminder */}
      <div className="flex gap-4 text-xs font-mono">
        <span className="text-yellow-400">💰 {(nation.resource?.gold ?? 0).toLocaleString()} gold</span>
        <span className="text-slate-300">⚙️ {(nation.resource?.steel ?? 0).toLocaleString()} steel</span>
      </div>

      {/* Training queue */}
      {trainingQueue.length > 0 && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-200 text-sm">Training Queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {trainingQueue.map((job) => (
              <div key={job.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-300">
                  {job.quantity}× {job.unitTypeId}
                </span>
                <span className="text-slate-500 text-xs">
                  completes {new Date(job.completesAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Unit roster */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {unitTypes.map((unit) => {
          const owned   = ownedUnits[unit.slug] ?? 0;
          const locked  = !!unit.requiresTech;
          return (
            <Card
              key={unit.id}
              className={`bg-slate-900 border-slate-800 ${locked ? "opacity-60" : ""}`}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-slate-100">{unit.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Owned: <span className="text-slate-300 font-mono">{owned.toLocaleString()}</span>
                    </p>
                  </div>
                  {locked && (
                    <Badge variant="outline" className="text-xs border-slate-700 text-slate-500">
                      🔒 Requires research
                    </Badge>
                  )}
                </div>

                <Separator className="bg-slate-800 mb-3" />

                <div className="grid grid-cols-3 gap-2 text-xs text-center mb-3">
                  <div>
                    <p className="text-slate-500">ATK</p>
                    <p className="text-red-400 font-bold">{unit.attack}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">DEF</p>
                    <p className="text-blue-400 font-bold">{unit.defense}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">SPD</p>
                    <p className="text-green-400 font-bold">{unit.speed}x</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
                  <span>💰 {unit.goldCost.toLocaleString()} + ⚙️ {unit.steelCost}</span>
                  <span>⏱ {formatTime(unit.trainTimeSec)}</span>
                </div>

                {!locked && (
                  <ArsenalTrainForm
                    unitTypeId={unit.id}
                    unitName={unit.name}
                    goldCost={unit.goldCost}
                    steelCost={unit.steelCost}
                    availableGold={nation.resource?.gold ?? 0}
                    availableSteel={nation.resource?.steel ?? 0}
                  />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function formatTime(secs: number): string {
  if (secs < 60)   return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h`;
}
