"use client";

import { signOut } from "next-auth/react";
import { Bell, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface TopBarProps {
  nationName?: string;
  money?:      number;
  land?:       number;
  turns?:      number;
  maxTurns?:   number;
}

export function TopBar({ nationName, money, land, turns, maxTurns }: TopBarProps) {
  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-4 shrink-0">
      {nationName && (
        <span className="text-slate-200 font-semibold text-sm tracking-wide hidden sm:block shrink-0">
          {nationName}
        </span>
      )}

      {/* Resource HUD */}
      <div className="flex items-center gap-3 ml-auto text-xs font-mono flex-wrap">
        {money !== undefined && <span className="text-yellow-400" title="Money">💰 {money.toLocaleString()}</span>}
        {land  !== undefined && <span className="text-green-400"  title="Land">🌍 {land.toLocaleString()}</span>}
        {turns !== undefined && (
          <span
            className={turns > 0 ? "text-purple-400" : "text-slate-600"}
            title={`Turns (${turns}/${maxTurns ?? 100})`}
          >
            ⚡ {turns}/{maxTurns ?? 100}
          </span>
        )}
      </div>

      {/* Alerts */}
      <div className="relative shrink-0">
        <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-200">
          <Bell className="w-4 h-4" />
        </Button>
        <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 w-4 p-0 text-[10px] flex items-center justify-center">
          0
        </Badge>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="text-slate-400 hover:text-red-400 shrink-0"
        onClick={() => signOut({ callbackUrl: "/login" })}
        title="Sign out"
      >
        <LogOut className="w-4 h-4" />
      </Button>
    </header>
  );
}
