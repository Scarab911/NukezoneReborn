import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Zap, Shield, Sword, TrendingUp, Users } from "lucide-react";

export default async function LandingPage() {
  // Logged-in players go straight to dashboard
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-red-500" />
          <span className="font-bold tracking-widest uppercase text-sm text-slate-100">
            Nukezone<span className="text-red-500">Reborn</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" className="text-slate-300 hover:text-slate-100">
              Sign In
            </Button>
          </Link>
          <Link href="/register">
            <Button className="bg-red-700 hover:bg-red-600 text-white font-semibold">
              Play Now
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-red-950/50 border border-red-900/50 rounded-full px-4 py-1.5 text-sm text-red-400 mb-8">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            World 1 — Now Active
          </div>

          <h1 className="text-5xl sm:text-6xl font-black tracking-tight text-slate-50 mb-6 leading-tight">
            Build Your Nation.<br />
            <span className="text-red-500">Arm Your Arsenal.</span>
          </h1>

          <p className="text-lg text-slate-400 max-w-xl mx-auto mb-10 leading-relaxed">
            A persistent multiplayer nuclear war strategy game. Manage your economy,
            train armies, research weapons, form alliances — and dominate the nuclear age.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button
                size="lg"
                className="bg-red-700 hover:bg-red-600 text-white font-bold tracking-wide px-8 h-12 text-base"
              >
                Found Your Nation — Free
              </Button>
            </Link>
            <Link href="/login">
              <Button
                size="lg"
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800 h-12 px-8 text-base"
              >
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </main>

      {/* Feature grid */}
      <section className="border-t border-slate-800 px-6 py-16">
        <div className="max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {[
            { icon: TrendingUp, label: "Economy",    desc: "Tax, trade, banking" },
            { icon: Sword,      label: "Military",   desc: "Infantry to ICBMs"  },
            { icon: Shield,     label: "Defense",    desc: "Intercept & fortify" },
            { icon: Users,      label: "Alliances",  desc: "Diplomacy & wars"   },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
                <Icon className="w-5 h-5 text-red-400" />
              </div>
              <p className="font-semibold text-slate-200 text-sm">{label}</p>
              <p className="text-xs text-slate-500">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-800 px-6 py-4 text-center text-xs text-slate-600">
        NukezoneReborn — A remake of Nukezone.nu
      </footer>
    </div>
  );
}
