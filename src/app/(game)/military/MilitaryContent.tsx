"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface Target {
  id: string; name: string; color: string;
  hp: number; maxHp: number; totalUnits: number;
}

interface Props {
  myNationId: string;
  totalUnits: Record<string, number>;
  gold:       number;
  targets:    Target[];
}

export function MilitaryContent({ totalUnits, gold, targets }: Props) {
  const router   = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy,     setBusy]     = useState(false);

  const totalOwned = Object.values(totalUnits).reduce((a, b) => a + b, 0);

  async function launchAttack() {
    if (!selected || busy) return;
    setBusy(true);
    const res = await fetch("/api/military/launch", {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": crypto.randomUUID(),
      },
      body: JSON.stringify({ targetNationId: selected }),
    });
    const data = await res.json() as { error?: string };
    setBusy(false);
    if (!res.ok) { toast.error(data.error ?? "Attack failed"); return; }
    toast.success("Attack launched!");
    setSelected(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Military</h1>
        <p className="text-slate-500 text-sm mt-0.5">Command your forces</p>
      </div>

      {/* Own forces summary */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <p className="text-slate-300 font-semibold text-sm mb-3">Your Forces</p>
        {totalOwned === 0 ? (
          <p className="text-slate-500 text-sm">No units trained. Visit the Arsenal to train units.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {Object.entries(totalUnits).filter(([, qty]) => qty > 0).map(([name, qty]) => (
              <div key={name} className="text-xs bg-slate-800 rounded px-3 py-1.5">
                <span className="text-slate-400">{name}</span>
                <span className="text-red-400 font-bold font-mono ml-2">{qty.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Target list */}
      <div>
        <p className="text-slate-400 text-sm font-medium mb-3">
          Select Target ({targets.length} nations)
        </p>

        {targets.length === 0 && (
          <p className="text-slate-500 text-sm py-8 text-center">
            No other active nations to attack yet.
          </p>
        )}

        <div className="space-y-2">
          {targets.map((t) => {
            const hpPct   = Math.round((t.hp / Math.max(1, t.maxHp)) * 100);
            const isSelected = selected === t.id;

            return (
              <button
                key={t.id}
                onClick={() => setSelected(isSelected ? null : t.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-colors ${
                  isSelected
                    ? "border-red-700 bg-red-950/30"
                    : "border-slate-800 bg-slate-900 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="text-slate-200 font-medium text-sm">{t.name}</span>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono">
                  <span className={hpPct > 60 ? "text-green-400" : hpPct > 30 ? "text-yellow-400" : "text-red-400"}>
                    HP {hpPct}%
                  </span>
                  <span className="text-red-400">{t.totalUnits.toLocaleString()} units</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Attack button */}
      {selected && (
        <div className="sticky bottom-4 bg-slate-900 border border-red-900/50 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-slate-200 text-sm font-semibold">
              Target: {targets.find((t) => t.id === selected)?.name}
            </p>
            <p className="text-slate-500 text-xs mt-0.5">
              {totalOwned.toLocaleString()} units will be sent
            </p>
          </div>
          <button
            onClick={launchAttack}
            disabled={busy || totalOwned === 0}
            className="px-6 py-2 bg-red-700 hover:bg-red-600 text-white font-bold text-sm rounded-lg disabled:opacity-40 transition-colors"
          >
            {busy ? "Launching…" : "⚔️ Launch Attack"}
          </button>
        </div>
      )}

      {totalOwned === 0 && targets.length > 0 && (
        <div className="text-center">
          <Badge variant="outline" className="border-slate-700 text-slate-500">
            Train units in the Arsenal before attacking
          </Badge>
        </div>
      )}
    </div>
  );
}
