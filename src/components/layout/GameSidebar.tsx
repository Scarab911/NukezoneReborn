"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Sword, FlaskConical, Shield, Users,
  TrendingUp, Landmark, Trophy, MessageSquare, Settings, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard",  label: "Dashboard",  icon: LayoutDashboard },
  { href: "/military",   label: "Military",   icon: Sword },
  { href: "/research",   label: "Research",   icon: FlaskConical },
  { href: "/defense",    label: "Defense",    icon: Shield },
  { href: "/alliances",  label: "Alliances",  icon: Users },
  { href: "/market",     label: "Market",     icon: TrendingUp },
  { href: "/bank",       label: "Bank",       icon: Landmark },
  { href: "/rankings",   label: "Rankings",   icon: Trophy },
  { href: "/messages",   label: "Messages",   icon: MessageSquare },
  { href: "/settings",   label: "Settings",   icon: Settings },
];

export function GameSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-56 shrink-0 bg-slate-900 border-r border-slate-800 min-h-screen">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-red-500" />
          <span className="font-bold text-slate-100 tracking-widest uppercase text-sm">
            Nukezone
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors",
                active
                  ? "bg-red-950/60 text-red-400 border border-red-900/50"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800",
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-800">
        <p className="text-xs text-slate-600 text-center tracking-wider uppercase">
          World 1
        </p>
      </div>
    </aside>
  );
}
