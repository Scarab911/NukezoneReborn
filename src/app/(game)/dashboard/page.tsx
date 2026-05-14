import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Shield, Sword, Zap, TrendingUp } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const nation = await prisma.nation.findUnique({
    where: { playerId: session.user.id },
    include: {
      resource: true,
      morale: true,
      _count: { select: { armies: true, spyUnits: true } },
    },
  });

  if (!nation) redirect("/setup");

  const hpPct = Math.round((nation.hp / nation.maxHp) * 100);
  const morale = nation.morale?.morale ?? 75;

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
          className={nation.status === "ACTIVE"
            ? "border-green-700 text-green-400"
            : ""}
        >
          {nation.status}
        </Badge>
      </div>

      {/* Stat cards — row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="HP"
          value={`${nation.hp.toLocaleString()} / ${nation.maxHp.toLocaleString()}`}
          icon={<Shield className="w-4 h-4 text-green-400" />}
          sub={<Progress value={hpPct} className="h-1.5 mt-2 bg-slate-700 [&>div]:bg-green-500" />}
        />
        <StatCard
          label="Morale"
          value={`${morale}%`}
          icon={<TrendingUp className="w-4 h-4 text-yellow-400" />}
          sub={<Progress value={morale} className="h-1.5 mt-2 bg-slate-700 [&>div]:bg-yellow-500" />}
        />
        <StatCard
          label="Armies"
          value={nation._count.armies.toString()}
          icon={<Sword className="w-4 h-4 text-red-400" />}
        />
        <StatCard
          label="Spy Units"
          value={nation._count.spyUnits.toString()}
          icon={<Zap className="w-4 h-4 text-purple-400" />}
        />
      </div>

      {/* Resources */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-200 text-base">Resources</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <ResourceRow emoji="💰" label="Gold"   value={nation.resource?.gold   ?? 0} color="text-yellow-400" />
            <ResourceRow emoji="🌾" label="Food"   value={nation.resource?.food   ?? 0} color="text-green-400"  />
            <ResourceRow emoji="⚙️" label="Steel"  value={nation.resource?.steel  ?? 0} color="text-slate-300"  />
            <ResourceRow emoji="⚡" label="Energy" value={nation.resource?.energy ?? 0} color="text-blue-400"   />
          </div>
        </CardContent>
      </Card>

      {/* Recent activity placeholder */}
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

function StatCard({
  label, value, icon, sub,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
          {icon}
        </div>
        <p className="text-xl font-bold text-slate-100">{value}</p>
        {sub}
      </CardContent>
    </Card>
  );
}

function ResourceRow({
  emoji, label, value, color,
}: {
  emoji: string;
  label: string;
  value: number;
  color: string;
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
