"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp, Sword, Zap, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

interface Props {
  nation: {
    name:     string;
    status:   string;
    turns:    number;
    maxTurns: number;
    totalUnits: number;
    minsToNextTurn: number;
    armies:   number;
    spyUnits: number;
    battles:  number;
    explorationCount: number;
  };
  morale:    number;
  resources: { money: number; land: number; population: number; energy: number };
}

function calcExplorePreview(count: number) {
  const turnCost   = 1 + Math.floor(count / 2);
  const landGained = Math.max(10, Math.floor(500 * Math.pow(0.85, count)));
  return { turnCost, landGained };
}

export function DashboardContent({ nation, morale, resources }: Props) {
  const router   = useRouter();
  const turnPct  = Math.round((nation.turns / nation.maxTurns) * 100);
  const [exploring, setExploring] = useState(false);
  const [exploreCount, setExploreCount] = useState(nation.explorationCount);

  async function handleExplore() {
    setExploring(true);
    const res = await fetch("/api/game/explore", { method: "POST" });
    const data = await res.json() as {
      landGained?: number; turnCost?: number; explorationCount?: number;
      error?: string;
    };
    setExploring(false);
    if (!res.ok) { toast.error(data.error ?? "Exploration failed"); return; }
    toast.success(`+${data.landGained} land explored!`);
    setExploreCount(data.explorationCount ?? exploreCount + 1);
    router.refresh();
  }

  // Run economy tick on mount + every 30s
  useEffect(() => {
    async function tick() {
      const res = await fetch("/api/tick/economy", { method: "POST" });
      const data = await res.json() as { ticks?: number; totalNet?: number };
      if ((data.ticks ?? 0) > 0) router.refresh();
    }
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [router]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{nation.name}</h1>
          <p className="text-slate-500 text-sm mt-0.5">Nation Overview</p>
        </div>
        <Badge
          variant={nation.status === "ACTIVE" ? "outline" : "destructive"}
          className={nation.status === "ACTIVE" ? "border-green-700 text-green-400" : nation.status === "PROTECTED" ? "border-blue-700 text-blue-400" : ""}
        >
          {nation.status}
        </Badge>
      </div>

      {/* Turn display */}
      <Card className="bg-slate-900 border-slate-800 border-purple-900/30">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-purple-300 font-semibold text-sm">⚡ Turns</span>
            <div className="text-right">
              <span className="text-purple-400 font-bold font-mono text-lg">{nation.turns}</span>
              <span className="text-slate-500 text-sm"> / {nation.maxTurns}</span>
            </div>
          </div>
          <Progress value={turnPct} className="h-2 bg-slate-700 [&>div]:bg-purple-500" />
          {nation.turns < nation.maxTurns && (
            <p className="text-slate-500 text-xs mt-1.5">
              Next turn in {nation.minsToNextTurn} min · 1 turn / 5 min
            </p>
          )}
        </CardContent>
      </Card>

      {/* Explore land */}
      <ExplorePanel
        turns={nation.turns}
        explorationCount={exploreCount}
        onExplore={handleExplore}
        busy={exploring}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Morale" value={`${morale}%`}
          icon={<TrendingUp className="w-4 h-4 text-yellow-400" />}
          bar={<Progress value={morale} className="h-1.5 mt-2 bg-slate-700 [&>div]:bg-yellow-500" />} />
        <StatCard label="Units" value={nation.totalUnits.toLocaleString()}
          icon={<Sword className="w-4 h-4 text-red-400" />} />
        <StatCard label="Battles Fought" value={nation.battles.toString()}
          icon={<Zap className="w-4 h-4 text-orange-400" />} />
        <StatCard label="Spy Units" value={nation.spyUnits.toString()}
          icon={<Users className="w-4 h-4 text-purple-400" />} />
      </div>

      {/* Resources */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-200 text-base">Resources</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <ResourceRow emoji="💰" label="Money"      value={resources.money}      color="text-yellow-400" />
            <ResourceRow emoji="🌍" label="Land"       value={resources.land}       color="text-green-400"  />
            <ResourceRow emoji="👥" label="Population" value={resources.population} color="text-blue-300"   />
            <ResourceRow emoji="⚡" label="Energy"     value={resources.energy}     color="text-blue-400"   />
          </div>
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-200 text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-500 text-sm text-center py-6">
            No recent activity. Use your turns to attack, build, or research.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ExplorePanel({
  turns, explorationCount, onExplore, busy,
}: {
  turns: number;
  explorationCount: number;
  onExplore: () => void;
  busy: boolean;
}) {
  const { turnCost, landGained } = calcExplorePreview(explorationCount);
  const { landGained: nextLand }  = calcExplorePreview(explorationCount + 1);
  const efficiency = landGained / turnCost;        // land per turn
  const lowValue   = efficiency < 50;
  const canAfford  = turns >= turnCost;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-slate-200 font-semibold text-sm mb-0.5">🏔 Explore Land</p>
            <p className="text-slate-500 text-xs">
              Gain <span className="text-green-400 font-mono font-bold">+{landGained}</span> land
              for <span className="text-purple-400 font-mono font-bold">{turnCost}</span> turn{turnCost !== 1 ? "s" : ""}
            </p>
            {lowValue && (
              <p className="text-xs text-amber-600 mt-1">
                ⚠ Diminishing returns — consider warfare for faster land gains
              </p>
            )}
            <p className="text-xs text-slate-600 mt-1">
              Next: +{nextLand} land ({1 + Math.floor((explorationCount + 1) / 2)} turn{1 + Math.floor((explorationCount + 1) / 2) !== 1 ? "s" : ""})
            </p>
          </div>
          <button
            onClick={onExplore}
            disabled={busy || !canAfford}
            className="shrink-0 px-4 py-2 rounded bg-green-800 hover:bg-green-700 text-white text-xs font-semibold transition-colors disabled:opacity-40"
          >
            {busy ? "Exploring…" : !canAfford ? `Need ${turnCost} turn${turnCost !== 1 ? "s" : ""}` : "Explore"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, icon, bar }: {
  label: string; value: string; icon: React.ReactNode; bar?: React.ReactNode;
}) {
  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
          {icon}
        </div>
        <p className="text-xl font-bold text-slate-100">{value}</p>
        {bar}
      </CardContent>
    </Card>
  );
}

function ResourceRow({ emoji, label, value, color }: {
  emoji: string; label: string; value: number; color: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
      <span className={`text-lg font-bold font-mono ${color}`}>
        {emoji} {value.toLocaleString()}
      </span>
    </div>
  );
}
