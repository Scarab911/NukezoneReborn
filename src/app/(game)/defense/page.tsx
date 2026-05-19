import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function DefensePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const nation = await prisma.nation.findUnique({
    where:   { playerId: session.user.id },
    include: { buildings: true, ciRating: true },
  });
  if (!nation) redirect("/setup");

  const towers = nation.buildings.find((b) => b.type === "DEFENSE_TOWERS")?.count ?? 0;
  const silos  = nation.buildings.find((b) => b.type === "MISSILE_SILO")?.count    ?? 0;
  const ci     = nation.ciRating?.rating ?? 10;
  const defenseBonus = Math.round(towers * 8);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Defense</h1>
        <p className="text-slate-500 text-sm mt-0.5">Passive defenses and counter-intelligence</p>
      </div>

      {/* Defense stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Defense Towers",  value: towers,        unit: "buildings", color: "text-blue-400",   emoji: "🛡️", note: `+${defenseBonus}% defense bonus` },
          { label: "Missile Silos",   value: silos,         unit: "silos",     color: "text-red-400",    emoji: "🚀", note: `${silos} strategic weapon slots` },
          { label: "CI Rating",       value: ci,            unit: "/ 100",     color: "text-purple-400", emoji: "🕵️", note: "Counter-intelligence strength" },
        ].map(({ label, value, unit, color, emoji, note }) => (
          <div key={label} className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{emoji}</span>
              <p className="text-slate-400 text-xs uppercase tracking-wider">{label}</p>
            </div>
            <p className={`text-2xl font-bold font-mono ${color}`}>
              {value} <span className="text-sm text-slate-500">{unit}</span>
            </p>
            <p className="text-xs text-slate-500 mt-1">{note}</p>
          </div>
        ))}
      </div>

      {/* How to improve */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <h2 className="text-slate-200 font-semibold text-sm mb-4">How to Strengthen Defense</h2>
        <div className="space-y-3 text-sm">
          {[
            { action: "Build Defense Towers",   where: "/buildings", effect: "+8% defense per tower, stacks up to 10×", emoji: "🛡️" },
            { action: "Research Perimeter Defense", where: "/research", effect: "+10% unit defense across all units", emoji: "🔬" },
            { action: "Research Missile Defense",   where: "/research", effect: "+20% strategic intercept chance", emoji: "🎯" },
            { action: "Train SAM Tanks",         where: "/arsenal",   effect: "High defense units counter air attacks", emoji: "🚀" },
            { action: "Research CI Network",     where: "/research",  effect: "+25 CI rating vs spy operations", emoji: "🕵️" },
          ].map(({ action, where, effect, emoji }) => (
            <div key={action} className="flex items-start gap-3">
              <span className="text-lg shrink-0">{emoji}</span>
              <div>
                <a href={where} className="text-blue-400 hover:text-blue-300 font-medium">{action}</a>
                <p className="text-slate-500 text-xs mt-0.5">{effect}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Spy ops against you placeholder */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <h2 className="text-slate-200 font-semibold text-sm mb-3">Recent Security Events</h2>
        <p className="text-slate-500 text-sm text-center py-4">
          No detected spy operations. Your CI rating of <span className="text-purple-400 font-mono">{ci}</span> is
          {ci < 30 ? " low — consider investing in Counter-Intelligence research." : ci < 60 ? " moderate." : " strong."}
        </p>
      </div>
    </div>
  );
}
