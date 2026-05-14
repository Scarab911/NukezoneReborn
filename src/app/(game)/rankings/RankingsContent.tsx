"use client";

import { Badge } from "@/components/ui/badge";

interface NationEntry {
  id: string; rank: number; name: string; status: string;
  color: string; hp: number; maxHp: number; totalUnits: number;
  morale: number; gold: number; battles: number;
  isOwn: boolean; score: number;
}

export function RankingsContent({ nations }: { nations: NationEntry[] }) {
  if (nations.length === 0) {
    return (
      <div className="text-center py-20 text-slate-500">
        No nations in the world yet. Be the first!
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Rankings</h1>
        <p className="text-slate-500 text-sm mt-0.5">World 1 — {nations.length} nations</p>
      </div>

      {/* Header row */}
      <div className="hidden md:grid grid-cols-[3rem_1fr_6rem_6rem_6rem_6rem] gap-4 px-4 text-xs text-slate-500 uppercase tracking-wider">
        <span>#</span>
        <span>Nation</span>
        <span className="text-right">Score</span>
        <span className="text-right">Units</span>
        <span className="text-right">HP%</span>
        <span className="text-right">Morale</span>
      </div>

      <div className="space-y-1">
        {nations.map((n) => {
          const hpPct = Math.round((n.hp / Math.max(1, n.maxHp)) * 100);
          const medal = n.rank === 1 ? "🥇" : n.rank === 2 ? "🥈" : n.rank === 3 ? "🥉" : null;

          return (
            <div
              key={n.id}
              className={`grid grid-cols-[3rem_1fr] md:grid-cols-[3rem_1fr_6rem_6rem_6rem_6rem] gap-4 items-center px-4 py-3 rounded-lg border transition-colors ${
                n.isOwn
                  ? "border-red-900/60 bg-red-950/20"
                  : "border-slate-800 bg-slate-900 hover:border-slate-700"
              }`}
            >
              {/* Rank */}
              <span className="text-sm font-bold text-slate-400 font-mono">
                {medal ?? `#${n.rank}`}
              </span>

              {/* Name + status */}
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: n.color }}
                />
                <span className={`font-semibold text-sm truncate ${n.isOwn ? "text-red-300" : "text-slate-200"}`}>
                  {n.name}
                  {n.isOwn && <span className="ml-1 text-xs text-slate-500">(you)</span>}
                </span>
                {n.status === "PROTECTED" && (
                  <Badge variant="outline" className="text-[10px] border-blue-800 text-blue-400 shrink-0">
                    🛡 Protected
                  </Badge>
                )}
              </div>

              {/* Stats — hidden on mobile */}
              <span className="hidden md:block text-right text-slate-300 font-mono text-sm">
                {n.score.toLocaleString()}
              </span>
              <span className="hidden md:block text-right text-red-400 font-mono text-sm">
                {n.totalUnits.toLocaleString()}
              </span>
              <span className={`hidden md:block text-right font-mono text-sm ${hpPct > 60 ? "text-green-400" : hpPct > 30 ? "text-yellow-400" : "text-red-400"}`}>
                {hpPct}%
              </span>
              <span className="hidden md:block text-right text-slate-300 font-mono text-sm">
                {n.morale}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
