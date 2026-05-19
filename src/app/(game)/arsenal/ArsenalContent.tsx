"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArsenalTrainForm } from "./ArsenalTrainForm";

type UnitCat = "GROUND" | "AIR" | "SEA" | "SPECIAL" | "STRATEGIC";

interface UnitTypeData {
  id: string; name: string; slug: string; category: string;
  attack: number; defense: number; moneyCost: number; upkeep: number;
  requiresTech: string | null; sortOrder: number;
}

interface Props {
  money:         number;
  turns:         number;
  ownedUnits:    Record<string, number>;
  unitTypes:     UnitTypeData[];
  trainingQueue: Array<{ id: string; unitTypeId: string; quantity: number; completesAt: string }>;
}

const CAT_LABEL: Record<UnitCat, string> = {
  GROUND: "⚔️ Ground", AIR: "✈️ Air", SEA: "🚢 Sea", SPECIAL: "🕵️ Special", STRATEGIC: "☢️ Strategic",
};
const CATS: UnitCat[] = ["GROUND", "AIR", "SEA", "SPECIAL", "STRATEGIC"];

// Counter hints per unit slug — shown in the unit card
const COUNTER_HINT: Record<string, string> = {
  "ranger-squad":          "Counters: Spear Team",
  "spear-team":            "Counters: Titan MBT, Storm Artillery",
  "ghost-operators":       "Counters: Ranger Squad",
  "titan-apc":             "Counters: Ranger Squad, Ghost Operators",
  "titan-mbt":             "Counters: Titan APC",
  "storm-artillery":       "Counters: Static defenses",
  "viper-gunship":         "Counters: Titan MBT, Titan APC",
  "predator-drone-swarm":  "Counters: Infantry, unarmored units",
  "strike-jet-squadron":   "Counters: Viper Gunship, Predator Drones",
  "leviathan-destroyer":   "Counters: Strike Jets, air threats",
  "phantom-submarine":     "Counters: Atlas Carrier, Leviathan",
  "atlas-carrier":         "Counters: General naval presence",
  "shadow-cell":           "Counters: Ground formations",
  "stealth-raider-wing":   "Counters: Leviathan Destroyer",
};

export function ArsenalContent({ money, turns, ownedUnits, unitTypes, trainingQueue }: Props) {
  const [activeTab, setActiveTab] = useState<UnitCat>("GROUND");

  const byCategory = Object.fromEntries(
    CATS.map((c) => [c, unitTypes.filter((u) => u.category === c)]),
  ) as Record<UnitCat, UnitTypeData[]>;

  const visible = byCategory[activeTab] ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Arsenal</h1>
        <p className="text-slate-500 text-sm mt-0.5">Train your military forces</p>
      </div>

      <div className="flex gap-2 text-xs font-mono">
        <span className="text-yellow-400">💰 {money.toLocaleString()}</span>
        <span className="text-purple-400">⚡ {turns} turns</span>
      </div>

      {/* Training queue */}
      {trainingQueue.length > 0 && (
        <div className="bg-slate-900 border border-blue-900/40 rounded-lg p-3 space-y-1">
          <p className="text-blue-300 text-xs font-semibold mb-2">⏳ Training Queue</p>
          {trainingQueue.map((job) => (
            <div key={job.id} className="flex justify-between text-xs text-slate-400">
              <span>{job.quantity}× unit</span>
              <span className="text-slate-500">{new Date(job.completesAt).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1">
        {CATS.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
              activeTab === cat
                ? "bg-red-800 text-white"
                : "bg-slate-800 text-slate-400 hover:bg-slate-700"
            }`}
          >
            {CAT_LABEL[cat]}
          </button>
        ))}
      </div>

      {/* Unit grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {visible.map((unit) => {
          const owned  = ownedUnits[unit.slug] ?? 0;
          const locked = !!unit.requiresTech;

          return (
            <Card key={unit.id} className={`bg-slate-900 border-slate-800 ${locked ? "opacity-55" : ""}`}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-slate-100 text-sm">{unit.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Owned: <span className="text-slate-300 font-mono">{owned.toLocaleString()}</span>
                    </p>
                  </div>
                  {locked && (
                    <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-500 shrink-0 ml-2">
                      🔒 Requires tech
                    </Badge>
                  )}
                </div>

                <Separator className="bg-slate-800 mb-3" />

                <div className="grid grid-cols-3 gap-2 text-xs text-center mb-3">
                  <div><p className="text-slate-500">ATK</p><p className="text-red-400 font-bold">{unit.attack}</p></div>
                  <div><p className="text-slate-500">DEF</p><p className="text-blue-400 font-bold">{unit.defense}</p></div>
                  <div><p className="text-slate-500">UPKEEP</p><p className="text-yellow-400 font-bold">{unit.upkeep}/tick</p></div>
                </div>

                <div className="text-xs text-slate-500 mb-1">
                  💰 {unit.moneyCost.toLocaleString()} per unit
                </div>

                {COUNTER_HINT[unit.slug] && (
                  <div className="text-xs text-green-600 mb-3">
                    {COUNTER_HINT[unit.slug]}
                  </div>
                )}

                {!locked && (
                  <ArsenalTrainForm
                    unitTypeId={unit.id}
                    unitName={unit.name}
                    moneyCost={unit.moneyCost}
                    availableMoney={money}
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
