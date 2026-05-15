"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

type ResearchStatus = "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

interface TechNodeData {
  id:            string;
  name:          string;
  slug:          string;
  category:      string;
  description:   string;
  goldCost:      number;
  durationSecs:  number;
  prerequisiteId: string | null;
  bonusType:     string | null;
  bonusValue:    number | null;
  sortOrder:     number;
}

interface ProgressEntry {
  status:      ResearchStatus;
  completesAt: string | null;
}

interface Props {
  gold:        number;
  techNodes:   TechNodeData[];
  progressMap: Record<string, ProgressEntry>;
}

const CATEGORY_COLOR: Record<string, string> = {
  MILITARY:  "border-red-800 text-red-400",
  ECONOMY:   "border-yellow-800 text-yellow-400",
  DEFENSE:   "border-blue-800 text-blue-400",
  ESPIONAGE: "border-purple-800 text-purple-400",
  NUCLEAR:   "border-orange-800 text-orange-400",
};

const CATEGORY_LABEL: Record<string, string> = {
  MILITARY:  "⚔️ Military",
  ECONOMY:   "💰 Economy",
  DEFENSE:   "🛡️ Defense",
  ESPIONAGE: "🕵️ Espionage",
  NUCLEAR:   "☢️ Nuclear",
};

export function ResearchContent({ gold, techNodes, progressMap }: Props) {
  const router  = useRouter();
  const [busy,  setBusy]  = useState<string | null>(null);
  const [now,   setNow]   = useState(Date.now());

  // Tick every second to update progress bars / countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-complete any expired research on mount and every 10s
  useEffect(() => {
    async function checkComplete() {
      const res = await fetch("/api/research/complete", { method: "POST" });
      const data = await res.json() as { completed?: Array<{ name: string }> };
      if (data.completed?.length) {
        data.completed.forEach((r) => toast.success(`✅ Research complete: ${r.name}`));
        router.refresh();
      }
    }
    checkComplete();
    const t = setInterval(checkComplete, 10_000);
    return () => clearInterval(t);
  }, [router]);

  const activeEntry = Object.entries(progressMap).find(
    ([, p]) => p.status === "IN_PROGRESS",
  );
  const activeId = activeEntry?.[0] ?? null;
  const activeTech = activeId ? techNodes.find((t) => t.id === activeId) : null;

  async function startResearch(techNodeId: string) {
    setBusy(techNodeId);
    const res = await fetch("/api/research/start", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ techNodeId }),
    });
    const data = await res.json() as { error?: string };
    setBusy(null);
    if (!res.ok) { toast.error(data.error ?? "Failed to start research"); return; }
    toast.success(`Research started!`);
    router.refresh();
  }

  function progressPct(entry: ProgressEntry, node: TechNodeData): number {
    if (!entry.completesAt) return 0;
    const end   = new Date(entry.completesAt).getTime();
    const start = end - node.durationSecs * 1000;
    return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  }

  function timeLeft(completesAt: string): string {
    const diff = Math.max(0, new Date(completesAt).getTime() - now);
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1000);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  // Group by category
  const categories = ["MILITARY", "ECONOMY", "DEFENSE", "ESPIONAGE", "NUCLEAR"];
  const byCategory = Object.fromEntries(
    categories.map((c) => [c, techNodes.filter((n) => n.category === c)]),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Research</h1>
        <p className="text-slate-500 text-sm mt-0.5">Advance your nation's technology</p>
      </div>

      <div className="text-xs font-mono text-yellow-400">💰 {gold.toLocaleString()} gold available</div>

      {/* Active research banner */}
      {activeTech && activeEntry && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-200 font-semibold text-sm">
              🔬 Researching: {activeTech.name}
            </span>
            <span className="text-slate-400 text-xs font-mono">
              {activeEntry[1].completesAt ? timeLeft(activeEntry[1].completesAt) : "—"} left
            </span>
          </div>
          <Progress
            value={progressPct(activeEntry[1], activeTech)}
            className="h-2 bg-slate-700 [&>div]:bg-blue-500"
          />
        </div>
      )}

      {/* Tech tree by category */}
      {categories.map((cat) => {
        const nodes = byCategory[cat];
        if (!nodes?.length) return null;
        return (
          <div key={cat}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-slate-300">
                {CATEGORY_LABEL[cat]}
              </span>
              <Separator className="flex-1 bg-slate-800" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {nodes.map((node) => {
                const entry    = progressMap[node.id];
                const done     = entry?.status === "COMPLETED";
                const inProg   = entry?.status === "IN_PROGRESS";
                const prereqOk = !node.prerequisiteId ||
                  progressMap[node.prerequisiteId]?.status === "COMPLETED";
                const canAfford = gold >= node.goldCost;
                const canStart  = prereqOk && canAfford && !activeId && !done && !inProg;

                return (
                  <div
                    key={node.id}
                    className={`rounded-lg border p-4 transition-opacity ${
                      done    ? "border-green-900 bg-green-950/20" :
                      inProg  ? "border-blue-800 bg-blue-950/20" :
                      !prereqOk ? "border-slate-800 bg-slate-900/50 opacity-50" :
                      "border-slate-800 bg-slate-900"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-slate-100 text-sm">{node.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{node.description}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ml-2 shrink-0 ${CATEGORY_COLOR[node.category]}`}
                      >
                        {done ? "✓ Done" : inProg ? "⏳" : `💰 ${node.goldCost.toLocaleString()}`}
                      </Badge>
                    </div>

                    {node.bonusType && (
                      <p className="text-xs text-slate-400 mb-3">
                        Bonus: <span className="text-green-400">{node.bonusType} +{node.bonusValue}</span>
                      </p>
                    )}

                    {!prereqOk && (
                      <p className="text-xs text-slate-600">🔒 Requires prerequisite</p>
                    )}

                    {inProg && entry.completesAt && (
                      <Progress
                        value={progressPct(entry, node)}
                        className="h-1.5 bg-slate-700 [&>div]:bg-blue-500 mt-1"
                      />
                    )}

                    {canStart && (
                      <button
                        onClick={() => startResearch(node.id)}
                        disabled={busy === node.id}
                        className="mt-3 w-full h-7 text-xs font-semibold rounded bg-blue-800 hover:bg-blue-700 text-white disabled:opacity-40 transition-colors"
                      >
                        {busy === node.id ? "Starting…" : `Research — ⏱ ${formatTime(node.durationSecs)}`}
                      </button>
                    )}

                    {!canAfford && prereqOk && !done && !inProg && !activeId && (
                      <p className="text-xs text-slate-600 mt-2">Need {node.goldCost.toLocaleString()} gold</p>
                    )}

                    {activeId && !inProg && !done && prereqOk && canAfford && (
                      <p className="text-xs text-slate-600 mt-2">Another research in progress</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatTime(secs: number): string {
  if (secs < 60)   return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${(secs / 3600).toFixed(1)}h`;
}
