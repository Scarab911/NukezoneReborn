"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArsenalTrainForm } from "./ArsenalTrainForm";

interface UnitTypeData {
  id:           string;
  name:         string;
  slug:         string;
  attack:       number;
  defense:      number;
  speed:        number;
  goldCost:     number;
  steelCost:    number;
  trainTimeSec: number;
  requiresTech: string | null;
}

interface TrainingJob {
  id:          string;
  unitTypeId:  string;
  quantity:    number;
  completesAt: string; // ISO string — serialisable from server
}

interface Props {
  gold:          number;
  steel:         number;
  ownedUnits:    Record<string, number>;
  unitTypes:     UnitTypeData[];
  trainingQueue: TrainingJob[];
}

export function ArsenalContent({ gold, steel, ownedUnits, unitTypes, trainingQueue }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Arsenal</h1>
        <p className="text-slate-500 text-sm mt-0.5">Train and manage your military units</p>
      </div>

      {/* Resources reminder */}
      <div className="flex gap-4 text-xs font-mono">
        <span className="text-yellow-400">💰 {gold.toLocaleString()} gold</span>
        <span className="text-slate-300">⚙️ {steel.toLocaleString()} steel</span>
      </div>

      {/* Training queue */}
      {trainingQueue.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-2">
          <p className="text-slate-200 text-sm font-medium mb-3">Training Queue</p>
          {trainingQueue.map((job) => (
            <div key={job.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-300">{job.quantity}× unit</span>
              <span className="text-slate-500 text-xs">
                {new Date(job.completesAt).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Unit roster */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {unitTypes.map((unit) => {
          const owned  = ownedUnits[unit.slug] ?? 0;
          const locked = !!unit.requiresTech;

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
                    availableGold={gold}
                    availableSteel={steel}
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
