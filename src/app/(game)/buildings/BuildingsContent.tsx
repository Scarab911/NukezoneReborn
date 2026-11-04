"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { OverflowBanner, type Overflow } from "@/components/game/OverflowBanner";

export interface BuildingDef {
  type:      string;
  label:     string;
  emoji:     string;
  effect:    string;
  /** False for buildings whose effect isn't implemented yet. */
  active:    boolean;
  moneyCost: number;
  count:     number;
  /** Housing buildings only: army space used / provided. */
  housing:   { used: number; capacity: number } | null;
}

interface Props {
  money:            number;
  land:             number;
  turns:            number;
  landPerBuilding:  number;
  turnsPerBuilding: number;
  maxPerOrder:      number;
  buildings:        BuildingDef[];
  overflows:        Overflow[];
}

export function BuildingsContent({
  money, land, turns, landPerBuilding, turnsPerBuilding, maxPerOrder, buildings, overflows,
}: Props) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(buildings.map((b) => [b.type, 1])),
  );
  const [busy, setBusy] = useState<string | null>(null);

  function setQty(type: string, val: number) {
    setQuantities((q) => ({ ...q, [type]: Math.max(1, Math.min(maxPerOrder, val || 1)) }));
  }

  async function build(type: string) {
    const qty = quantities[type] ?? 1;
    setBusy(type);
    try {
      const res  = await fetch("/api/buildings", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ type, count: qty }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { toast.error(data.error ?? "Build failed"); return; }
      toast.success(`Built ${qty}× ${buildings.find((b) => b.type === type)?.label}`);
      router.refresh();
    } catch {
      toast.error("Build failed: network error");
    } finally {
      setBusy(null);
    }
  }

  const totalBuilt = buildings.reduce((s, b) => s + b.count, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Buildings</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Your army lives in buildings: more units need more housing, and every building
          uses {landPerBuilding} free land and {turnsPerBuilding} turns
        </p>
      </div>

      <OverflowBanner overflows={overflows} />

      {/* Resource bar */}
      <div className="flex flex-wrap gap-4 text-xs font-mono">
        <span className="text-yellow-400">💰 {money.toLocaleString()} money</span>
        <span className="text-green-400">🌍 {land.toLocaleString()} free land</span>
        <span className="text-purple-400">⚡ {turns} turns</span>
        <span className="text-slate-500">🏗️ {totalBuilt} total buildings</span>
      </div>

      {/* Building grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {buildings.map((b) => {
          const qty        = quantities[b.type] ?? 1;
          const totalMoney = b.moneyCost       * qty;
          const totalLand  = landPerBuilding   * qty;
          const totalTurns = turnsPerBuilding  * qty;
          const canAfford  = money >= totalMoney && land >= totalLand && turns >= totalTurns;
          const over       = b.housing !== null && b.housing.used > b.housing.capacity;

          return (
            <Card key={b.type} className={`bg-slate-900 ${over ? "border-red-800/60" : "border-slate-800"} ${b.active ? "" : "opacity-60"}`}>
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
                    className={`text-xs shrink-0 ml-2 ${b.count > 0 ? "border-green-800 text-green-400" : "border-slate-700 text-slate-400"}`}
                  >
                    {b.count} built
                  </Badge>
                </div>

                {/* Housing usage */}
                {b.housing && (
                  <p className={`text-xs font-mono mb-2 ${over ? "text-red-400" : "text-slate-400"}`}>
                    🏠 Space used {b.housing.used.toLocaleString()} / {b.housing.capacity.toLocaleString()}
                  </p>
                )}

                {/* Costs */}
                <div className="flex items-center gap-3 text-xs font-mono text-slate-500 mb-3">
                  <span>💰 {b.moneyCost.toLocaleString()}</span>
                  <span>🌍 {landPerBuilding} land</span>
                  <span>⚡ {turnsPerBuilding} turns</span>
                </div>

                {/* Build form */}
                <div className="flex gap-2">
                  <Input
                    type="number" min={1} max={maxPerOrder}
                    value={qty}
                    onChange={(e) => setQty(b.type, parseInt(e.target.value))}
                    className="w-16 h-7 text-xs bg-slate-800 border-slate-700 text-slate-100"
                  />
                  <button
                    onClick={() => build(b.type)}
                    disabled={busy === b.type || !canAfford}
                    className="flex-1 h-7 text-xs font-semibold rounded bg-blue-800 hover:bg-blue-700 text-white disabled:opacity-40 transition-colors px-2"
                  >
                    {busy === b.type
                      ? "Building…"
                      : `Build (💰${totalMoney.toLocaleString()} · 🌍${totalLand} · ⚡${totalTurns})`}
                  </button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-slate-600 text-center">
        Losing a battle can raze buildings. If your army no longer fits, you have a grace period
        to rebuild before the excess units desert.
      </p>
    </div>
  );
}
