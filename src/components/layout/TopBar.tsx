"use client";

import { signOut } from "next-auth/react";
import { Bell, LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface TopBarProps {
  nationName?: string;
  gold?: number;
  food?: number;
  steel?: number;
  energy?: number;
}

export function TopBar({ nationName, gold, food, steel, energy }: TopBarProps) {
  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-4 shrink-0">
      {/* Mobile menu trigger — wired up in layout */}
      <Button variant="ghost" size="icon" className="md:hidden text-slate-400">
        <Menu className="w-5 h-5" />
      </Button>

      {/* Nation name */}
      {nationName && (
        <span className="text-slate-200 font-semibold text-sm tracking-wide hidden sm:block">
          {nationName}
        </span>
      )}

      {/* Resources HUD */}
      <div className="flex items-center gap-3 ml-auto text-xs font-mono">
        {gold !== undefined && (
          <span className="text-yellow-400" title="Gold">
            💰 {gold.toLocaleString()}
          </span>
        )}
        {food !== undefined && (
          <span className="text-green-400" title="Food">
            🌾 {food.toLocaleString()}
          </span>
        )}
        {steel !== undefined && (
          <span className="text-slate-300" title="Steel">
            ⚙️ {steel.toLocaleString()}
          </span>
        )}
        {energy !== undefined && (
          <span className="text-blue-400" title="Energy">
            ⚡ {energy.toLocaleString()}
          </span>
        )}
      </div>

      {/* Alerts */}
      <div className="relative">
        <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-200">
          <Bell className="w-4 h-4" />
        </Button>
        <Badge
          variant="destructive"
          className="absolute -top-1 -right-1 h-4 w-4 p-0 text-[10px] flex items-center justify-center"
        >
          0
        </Badge>
      </div>

      {/* Sign out */}
      <Button
        variant="ghost"
        size="icon"
        className="text-slate-400 hover:text-red-400"
        onClick={() => signOut({ callbackUrl: "/login" })}
        title="Sign out"
      >
        <LogOut className="w-4 h-4" />
      </Button>
    </header>
  );
}
