"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface BuildingDef {
  type:      string;
  label:     string;
  emoji:     string;
  effect:    string;
  moneyCost: number;
  landCost:  number;
  count:     number;
  maxCount:  number;
  turnCost:  number;
}

interface Props {
  money:     number;
  land:      number;
  turns:     number;
  buildings: BuildingDef[];
}

export function BuildingsContent({ money, land, turns, buildings }: Props) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(buildings.map((b) => [b.type, 1])),
  );
  const [busy, setBusy] = useState<string | null>(null);

  function setQty(type: string, val: number) {
    setQuantities((q) => ({ ...q, [type]: Math.max(1, Math.min(5, val || 1)) }));
  }

  async function build(type: string) {
    const qty = quantities[type] ?? 1;
    setBusy(type);
    const res = await fetch("/api/buildings", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ type, count: qty }),
    });
    const data = await res.json() as { error?: string };
    setBusy(null);
    if (!res.ok) { toast.error(data.error ?? "Build failed"); return; }
    toast.success(`Built ${qty}× ${buildings.find((b) => b.type === type)?.label}`);
    router.refresh();
  }

  const totalBuilt = buildings.reduce((s, b) => s + b.count, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Buildings</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Each building consumes 5 land · max 10 per type · costs 2 turns
        </p>
      </div>

      {/* Resource bar */}
      <div className="flex flex-wrap gap-4 text-xs font-mono">
        <span className="text-yellow-400">💰 {money.toLocaleString()} money</span>
        <span className="text-green-400">🌍 {land.toLocaleString()} land</span>
        <span className="text-purple-400">⚡ {turns} turns</span>
        <span className="text-slate-500">🏗️ {totalBuilt} total buildings</span>
      </div>

      {/* Building grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {buildings.map((b) => {
          const qty         = quantities[b.type] ?? 1;
          const totalMoney  = b.moneyCost  * qty;
          const totalLand   = b.landCost   * qty;
          const totalTurns  = b.turnCost   * qty;
          const canAfford   = money >= totalMoney && land >= totalLand && turns >= totalTurns;
          const atMax       = b.count >= b.maxCount;

          return (
            <Card key={b.type} className={`bg-slate-900 border-slate-800 ${atMax ? "opacity-60" : ""}`}>
              <CardContent className="pt-4 pb-4">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{b.emoji}</span>
                    <div>
                      <p className="font-semibold text-slate-100 text-sm">{b.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{b.effect}</p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-xs shrink-0 ml-2 ${
                      atMax
                        ? "border-slate-700 text-slate-500"
                        : b.count > 0
                          ? "border-green-800 text-green-400"
                          : "border-slate-700 text-slate-400"
                    }`}
                  >
                    {b.count}/{b.maxCount}
                  </Badge>
                </div>

                {/* Costs */}
                <div className="flex items-center gap-3 text-xs font-mono text-slate-500 mb-3">
                  <span>💰 {b.moneyCost.toLocaleString()}</span>
                  <span>🌍 {b.landCost} land</span>
                  <span>⚡ {b.turnCost} turns</span>
                </div>

                {/* Build form */}
                {!atMax && (
                  <div className="flex gap-2">
                    <Input
                      type="number" min={1} max={Math.min(5, b.maxCount - b.count)}
                      value={qty}
                      onChange={(e) => setQty(b.type, parseInt(e.target.value))}
                      className="w-16 h-7 text-xs bg-slate-800 border-slate-700 text-slate-100"
                    />
                    <button
                      onClick={() => build(b.type)}
                      disabled={busy === b.type || !canAfford}
                      className="flex-1 h-7 text-xs font-semibold rounded bg-blue-800 hover:bg-blue-700 text-white disabled:opacity-40 transition-colors px-2"
                    >
                      {busy === b.type ? "Building…" : `Build (💰${totalMoney.toLocaleString()} · 🌍${totalLand})`}
                    </button>
                  </div>
                )}
                {atMax && (
                  <p className="text-xs text-slate-600 text-center py-1">Maximum reached</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-slate-600 text-center">
        Building bonuses apply to all battles. Defense Towers protect you even while offline.
      </p>
    </div>
  );
}
