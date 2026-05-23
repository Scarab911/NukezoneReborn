"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface Target {
  id:     string;
  name:   string;
  color:  string;
  land:   number;
  power:  number;
  status: string;
}

interface Props {
  myNationId:          string;
  myPower:             number;
  myTotalUnits:        number;
  myStatus:            string;
  protectionExpiresAt: string | null;
  turns:               number;
  totalUnits:          Record<string, number>;
  targets:             Target[];
}

interface BattleResult {
  winner:                string;
  summary:               string;
  landGained:            number;
  moneyStolen:           number;
  attackerLost:          number;
  defenderLost:          number;
  attackerLostProtection?: boolean;
}

type SortKey = "power" | "land" | "name";
type FilterKey = "all" | "weaker" | "stronger";

const FILTER_LABEL: Record<FilterKey, string> = {
  all:      "All",
  weaker:   "Weaker",
  stronger: "Stronger",
};

function powerLabel(ratio: number): { label: string; color: string } {
  if (ratio < 0.5) return { label: "Easy",    color: "text-green-400" };
  if (ratio < 0.9) return { label: "Fair",     color: "text-yellow-400" };
  if (ratio < 1.3) return { label: "Even",     color: "text-orange-400" };
  return              { label: "Dangerous", color: "text-red-400"    };
}

export function MilitaryContent({
  myPower, myStatus, protectionExpiresAt, turns, totalUnits, targets,
}: Props) {
  const router = useRouter();

  const [selected,    setSelected]    = useState<string | null>(null);
  const [confirming,  setConfirming]  = useState(false);
  const [busy,        setBusy]        = useState(false);
  const [lastResult,  setLastResult]  = useState<BattleResult | null>(null);
  const [search,      setSearch]      = useState("");
  const [sort,        setSort]        = useState<SortKey>("power");
  const [filter,      setFilter]      = useState<FilterKey>("all");

  const isProtected = myStatus === "PROTECTED";

  const ownedTotal = Object.values(totalUnits).reduce((a, b) => a + b, 0);
  const canAttack  = turns > 0 && ownedTotal > 0;

  const processed = useMemo(() => {
    let list = targets.filter((t) => {
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter === "weaker"   && t.power >= myPower) return false;
      if (filter === "stronger" && t.power <  myPower) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sort === "power") return b.power - a.power;
      if (sort === "land")  return b.land  - a.land;
      return a.name.localeCompare(b.name);
    });

    return list;
  }, [targets, search, sort, filter, myPower]);

  const selectedTarget = targets.find((t) => t.id === selected) ?? null;

  function requestAttack() {
    if (!selected || !canAttack) return;
    setConfirming(true);
  }

  function cancelAttack() {
    setConfirming(false);
  }

  async function confirmAttack() {
    if (!selected || !canAttack || busy) return;
    setBusy(true);
    setConfirming(false);
    setLastResult(null);

    try {
      const res = await fetch("/api/military/attack", {
        method:  "POST",
        headers: {
          "Content-Type":      "application/json",
          "x-idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          targetNationId:            selected,
          acknowledgeProtectionLoss: isProtected,
        }),
      });
      const data = await res.json() as BattleResult & { error?: string; requiresConfirm?: boolean };
      if (!res.ok) {
        toast.error(data.error === "PROTECTION_ACTIVE" ? "You are still under protection." : (data.error ?? "Attack failed"));
        return;
      }
      if (data.attackerLostProtection) {
        toast.warning("Your protection has been lifted. You are now vulnerable.");
      }
      setLastResult(data);
      setSelected(null);
      if (data.winner === "ATTACKER") {
        toast.success(`Victory! ${data.summary}`);
      } else {
        toast.error(`Defeated. ${data.summary}`);
      }
      router.refresh();
    } catch {
      toast.error("Attack failed — network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Military</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          ⚡ {turns} turns — 1 per attack · Your power: <span className="text-orange-400 font-mono">{myPower.toLocaleString()}</span>
        </p>
        {isProtected && protectionExpiresAt && (
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-950/40 border border-blue-800/50 text-xs text-blue-300">
            🛡️ Under protection until{" "}
            <span className="font-semibold">{new Date(protectionExpiresAt).toLocaleString()}</span>
            <span className="text-blue-500">— attacking will remove it</span>
          </div>
        )}
      </div>

      {/* Own forces */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <p className="text-slate-300 font-semibold text-sm mb-2">Your Forces</p>
        {ownedTotal === 0 ? (
          <p className="text-slate-500 text-sm">No units — go to Arsenal to train.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(totalUnits).filter(([, q]) => q > 0).map(([name, qty]) => (
              <span key={name} className="text-xs bg-slate-800 rounded px-2.5 py-1">
                <span className="text-slate-400">{name}</span>
                <span className="text-red-400 font-bold font-mono ml-1.5">{qty.toLocaleString()}</span>
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
          <p className="font-semibold text-sm mb-1">
            {lastResult.winner === "ATTACKER" ? "⚔️ Victory" : "💀 Defeat"}
          </p>
          <p className="text-slate-300 text-sm">{lastResult.summary}</p>
          {lastResult.winner === "ATTACKER" && (
            <div className="flex gap-4 mt-2 text-xs font-mono">
              {lastResult.landGained  > 0 && <span className="text-green-400">+{lastResult.landGained} land</span>}
              {lastResult.moneyStolen > 0 && <span className="text-yellow-400">+{lastResult.moneyStolen.toLocaleString()} 💰</span>}
            </div>
          )}
          <p className="text-slate-500 text-xs mt-1.5">
            Your losses: {lastResult.attackerLost} · Enemy losses: {lastResult.defenderLost}
          </p>
        </div>
      )}

      {/* Target list controls */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="flex-1 px-3 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-500"
          />
          {/* Sort */}
          <div className="flex gap-1">
            {(["power", "land", "name"] as SortKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                className={`px-2.5 py-1.5 text-xs rounded transition-colors capitalize ${
                  sort === k
                    ? "bg-slate-600 text-slate-100"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-1">
          {(["all", "weaker", "stronger"] as FilterKey[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                filter === f
                  ? "bg-red-800 text-white"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              {FILTER_LABEL[f]}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-500 self-center">{processed.length} nations</span>
        </div>
      </div>

      {/* Target cards */}
      {processed.length === 0 && (
        <p className="text-slate-500 text-sm py-8 text-center">No nations match your filter.</p>
      )}

      <div className="space-y-2">
        {processed.map((t) => {
          const ratio = myPower > 0 ? t.power / myPower : 1;
          const { label: diffLabel, color: diffColor } = powerLabel(ratio);
          const potentialLand = Math.max(1, Math.floor(t.land * 0.05));

          return (
            <button
              key={t.id}
              onClick={() => { setSelected(t.id === selected ? null : t.id); setConfirming(false); }}
              className={`w-full rounded-lg border text-left transition-colors px-4 py-3 ${
                selected === t.id
                  ? "border-red-700 bg-red-950/30"
                  : "border-slate-800 bg-slate-900 hover:border-slate-700"
              }`}
            >
              {/* Row 1 — name + badges */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                  <span className="text-slate-100 font-semibold text-sm truncate">{t.name}</span>
                  {t.status === "PROTECTED" && (
                    <Badge variant="outline" className="text-[10px] border-blue-800 text-blue-400 shrink-0">Protected</Badge>
                  )}
                </div>
                <span className={`text-xs font-semibold shrink-0 ml-2 ${diffColor}`}>{diffLabel}</span>
              </div>

              {/* Row 2 — stats */}
              <div className="flex gap-4 text-xs font-mono text-slate-400">
                <span>🌍 <span className="text-green-400">{t.land.toLocaleString()}</span> land</span>
                <span>📊 <span className="text-orange-400">{t.power.toLocaleString()}</span> power</span>
                <span className="text-slate-600 ml-auto">+~{potentialLand} land on win</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Sticky attack panel */}
      {selectedTarget && (
        <div className={`sticky bottom-4 rounded-lg border p-4 shadow-2xl transition-colors ${
          confirming
            ? "bg-slate-900 border-amber-700/60"
            : "bg-slate-900 border-red-900/50"
        }`}>
          {!confirming ? (
            /* Normal state */
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-slate-200 text-sm font-semibold truncate">
                  Target: {selectedTarget.name}
                </p>
                <p className="text-slate-500 text-xs mt-0.5">
                  Power {selectedTarget.power.toLocaleString()} · 🌍 {selectedTarget.land.toLocaleString()} land ·{" "}
                  +~{Math.max(1, Math.floor(selectedTarget.land * 0.05))} land on win · Costs 1 turn
                </p>
                {!canAttack && (
                  <p className="text-red-400 text-xs mt-0.5">
                    {turns === 0 ? "No turns left" : "No units — train first"}
                  </p>
                )}
              </div>
              <button
                onClick={requestAttack}
                disabled={busy || !canAttack}
                className="shrink-0 px-6 py-2 bg-red-700 hover:bg-red-600 text-white font-bold text-sm rounded-lg disabled:opacity-40 transition-colors"
              >
                ⚔️ Attack
              </button>
            </div>
          ) : (
            /* Confirmation state */
            <div className="space-y-3">
              {isProtected ? (
                <p className="text-amber-300 text-sm font-semibold">
                  ⚠️ You are under protection. Attacking will permanently remove your shield.
                </p>
              ) : (
                <p className="text-slate-200 text-sm font-semibold">
                  Confirm attack on <span className="text-red-400">{selectedTarget.name}</span>?
                </p>
              )}
              <p className="text-slate-400 text-xs">
                {isProtected
                  ? `Protection expires ${new Date(protectionExpiresAt!).toLocaleString()}. Once removed it cannot be restored.`
                  : `Costs 1 turn · Resolves instantly · Potential gain: +~${Math.max(1, Math.floor(selectedTarget.land * 0.05))} land`}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={confirmAttack}
                  disabled={busy}
                  className={`flex-1 py-2 font-bold text-sm rounded-lg text-white disabled:opacity-40 transition-colors ${
                    isProtected ? "bg-amber-700 hover:bg-amber-600" : "bg-red-700 hover:bg-red-600"
                  }`}
                >
                  {busy ? "Attacking…" : isProtected ? "⚔️ Attack & lose protection" : "⚔️ Confirm attack"}
                </button>
                <button
                  onClick={cancelAttack}
                  disabled={busy}
                  className="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold text-sm rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
