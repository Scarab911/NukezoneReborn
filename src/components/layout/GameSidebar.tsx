"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Sword, FlaskConical, Shield, Users,
  TrendingUp, Landmark, Trophy, MessageSquare, Settings,
  Zap, Building2, Menu, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard",  label: "Dashboard",  icon: LayoutDashboard },
  { href: "/arsenal",    label: "Arsenal",    icon: Zap },
  { href: "/military",   label: "Military",   icon: Sword },
  { href: "/buildings",  label: "Buildings",  icon: Building2 },
  { href: "/research",   label: "Research",   icon: FlaskConical },
  { href: "/defense",    label: "Defense",    icon: Shield },
  { href: "/alliances",  label: "Alliances",  icon: Users },
  { href: "/market",     label: "Market",     icon: TrendingUp },
  { href: "/bank",       label: "Bank",       icon: Landmark },
  { href: "/rankings",   label: "Rankings",   icon: Trophy },
  { href: "/messages",   label: "Messages",   icon: MessageSquare },
  { href: "/settings",   label: "Settings",   icon: Settings },
];

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
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
  );
}

export function GameSidebar() {
  const pathname  = usePathname();
  const [open, setOpen] = useState(false);

  const logo = (
    <Link href="/dashboard" className="flex items-center gap-2" onClick={() => setOpen(false)}>
      <Zap className="w-5 h-5 text-red-500" />
      <span className="font-bold text-slate-100 tracking-widest uppercase text-sm">
        Nukezone
      </span>
    </Link>
  );

  const footer = (
    <div className="px-4 py-3 border-t border-slate-800 shrink-0">
      <p className="text-xs text-slate-600 text-center tracking-wider uppercase">World 1</p>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 bg-slate-900 border-r border-slate-800 min-h-screen">
        <div className="px-5 py-5 border-b border-slate-800 shrink-0">{logo}</div>
        <NavLinks pathname={pathname} />
        {footer}
      </aside>

      {/* Mobile: hamburger button (rendered in TopBar via slot — placed here for layout) */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-3 left-3 z-40 p-2 rounded bg-slate-800 border border-slate-700 text-slate-300"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile: drawer overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Drawer */}
          <div className="relative w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-full shadow-2xl">
            <div className="px-5 py-5 border-b border-slate-800 flex items-center justify-between shrink-0">
              {logo}
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-200"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            {footer}
          </div>
        </div>
      )}
    </>
  );
}
