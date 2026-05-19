"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface Target { id: string; name: string; color: string; totalUnits: number; status: string; }

interface Props {
  myNationId:  string;
  turns:       number;
  totalUnits:  Record<string, number>;
  targets:     Target[];
}

interface BattleResult {
  winner:      string;
  summary:     string;
  landGained:  number;
  moneyStolen: number;
  attackerLost: number;
  defenderLost: number;
}

export function MilitaryContent({ turns, totalUnits, targets }: Props) {
  const router    = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy,     setBusy]     = useState(false);
  const [lastResult, setLastResult] = useState<BattleResult | null>(null);

  const ownedTotal = Object.values(totalUnits).reduce((a, b) => a + b, 0);
  const canAttack  = turns > 0 && ownedTotal > 0;

  async function launchAttack() {
    if (!selected || !canAttack || busy) return;
    setBusy(true);
    setLastResult(null);

    const res = await fetch("/api/military/attack", {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": crypto.randomUUID(),
      },
      body: JSON.stringify({ targetNationId: selected }),
    });

    const data = await res.json() as BattleResult & { error?: string };
    setBusy(false);

    if (!res.ok) { toast.error(data.error ?? "Attack failed"); return; }

    setLastResult(data);
    if (data.winner === "ATTACKER") {
      toast.success(`Victory! ${data.summary}`);
    } else {
      toast.error(`Defeated. ${data.summary}`);
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Military</h1>
        <p className="text-slate-500 text-sm mt-0.5">⚡ {turns} turns available — 1 turn per attack</p>
      </div>

      {/* Own forces */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <p className="text-slate-300 font-semibold text-sm mb-3">Your Forces</p>
        {ownedTotal === 0 ? (
          <p className="text-slate-500 text-sm">No units. Go to Arsenal to train.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(totalUnits).filter(([, q]) => q > 0).map(([name, qty]) => (
              <span key={name} className="text-xs bg-slate-800 rounded px-3 py-1.5">
                <span className="text-slate-400">{name}</span>
                <span className="text-red-400 font-bold font-mono ml-2">{qty.toLocaleString()}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Last battle result */}
      {lastResult && (
        <div className={`rounded-lg border p-4 ${
          lastResult.winner === "ATTACKER"
            ? "border-green-800 bg-green-950/20"
            : "border-red-800 bg-red-950/20"
        }`}>
          <p className="font-semibold text-sm mb-2">
            {lastResult.winner === "ATTACKER" ? "⚔️ Victory" : "💀 Defeat"}
          </p>
          <p className="text-slate-300 text-sm">{lastResult.summary}</p>
          {lastResult.winner === "ATTACKER" && (
            <div className="flex gap-4 mt-2 text-xs font-mono">
              {lastResult.landGained  > 0 && <span className="text-green-400">+{lastResult.landGained} land</span>}
              {lastResult.moneyStolen > 0 && <span className="text-yellow-400">+{lastResult.moneyStolen.toLocaleString()} 💰</span>}
            </div>
          )}
          <p className="text-slate-500 text-xs mt-2">
            Your losses: {lastResult.attackerLost} · Enemy losses: {lastResult.defenderLost}
          </p>
        </div>
      )}

      {/* Target list */}
      <div>
        <p className="text-slate-400 text-sm font-medium mb-3">Select Target ({targets.length})</p>

        {targets.length === 0 && (
          <p className="text-slate-500 text-sm py-8 text-center">No active nations to attack yet.</p>
        )}

        <div className="space-y-2">
          {targets.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id === selected ? null : t.id)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-colors ${
                selected === t.id
                  ? "border-red-700 bg-red-950/30"
                  : "border-slate-800 bg-slate-900 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                <span className="text-slate-200 font-medium text-sm">{t.name}</span>
                {t.status === "PROTECTED" && (
                  <Badge variant="outline" className="text-[10px] border-blue-800 text-blue-400">Protected</Badge>
                )}
              </div>
              <span className="text-red-400 font-mono text-xs">{t.totalUnits.toLocaleString()} units</span>
            </button>
          ))}
        </div>
      </div>

      {/* Attack panel */}
      {selected && (
        <div className="sticky bottom-4 bg-slate-900 border border-red-900/50 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-slate-200 text-sm font-semibold">
              Target: {targets.find((t) => t.id === selected)?.name}
            </p>
            <p className="text-slate-500 text-xs mt-0.5">Costs 1 turn · Resolves instantly</p>
          </div>
          <button
            onClick={launchAttack}
            disabled={busy || !canAttack}
            className="px-6 py-2 bg-red-700 hover:bg-red-600 text-white font-bold text-sm rounded-lg disabled:opacity-40 transition-colors"
          >
            {busy ? "Attacking…" : "⚔️ Attack"}
          </button>
        </div>
      )}
    </div>
  );
}
