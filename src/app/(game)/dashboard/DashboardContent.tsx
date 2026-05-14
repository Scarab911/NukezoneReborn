"use client";

import { Shield, Sword, Zap, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  nation: {
    name:     string;
    status:   string;
    hp:       number;
    maxHp:    number;
    armies:   number;
    spyUnits: number;
  };
  morale:    number;
  resources: { gold: number; food: number; steel: number; energy: number };
}

export function DashboardContent({ nation, morale, resources }: Props) {
  const hpPct = Math.round((nation.hp / nation.maxHp) * 100);

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
          className={nation.status === "ACTIVE" ? "border-green-700 text-green-400" : ""}
        >
          {nation.status}
        </Badge>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="HP" value={`${nation.hp.toLocaleString()} / ${nation.maxHp.toLocaleString()}`}
          icon={<Shield className="w-4 h-4 text-green-400" />}
          bar={<Progress value={hpPct} className="h-1.5 mt-2 bg-slate-700 [&>div]:bg-green-500" />} />
        <StatCard label="Morale" value={`${morale}%`}
          icon={<TrendingUp className="w-4 h-4 text-yellow-400" />}
          bar={<Progress value={morale} className="h-1.5 mt-2 bg-slate-700 [&>div]:bg-yellow-500" />} />
        <StatCard label="Armies"    value={nation.armies.toString()}   icon={<Sword className="w-4 h-4 text-red-400"    />} />
        <StatCard label="Spy Units" value={nation.spyUnits.toString()} icon={<Zap   className="w-4 h-4 text-purple-400" />} />
      </div>

      {/* Resources */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-200 text-base">Resources</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <ResourceRow emoji="💰" label="Gold"   value={resources.gold}   color="text-yellow-400" />
            <ResourceRow emoji="🌾" label="Food"   value={resources.food}   color="text-green-400"  />
            <ResourceRow emoji="⚙️" label="Steel"  value={resources.steel}  color="text-slate-300"  />
            <ResourceRow emoji="⚡" label="Energy" value={resources.energy} color="text-blue-400"   />
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
            No recent activity. Launch an attack or start research to see events here.
          </p>
        </CardContent>
      </Card>
    </div>
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
