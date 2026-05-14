"use client";

import { create } from "zustand";
import type { IncomingAttackPayload, BattleResolvedPayload } from "@/types/socket";

export type AlertItem =
  | { type: "INCOMING_ATTACK"; id: string; data: IncomingAttackPayload; ts: number }
  | { type: "BATTLE_RESOLVED"; id: string; data: BattleResolvedPayload; ts: number }
  | { type: "SPY_DETECTED";    id: string; data: { message: string };   ts: number };

interface UIState {
  sidebarOpen: boolean;
  alerts:      AlertItem[];

  setSidebarOpen: (open: boolean) => void;
  toggleSidebar:  () => void;
  addAlert:       (alert: Omit<AlertItem, "id" | "ts">) => void;
  dismissAlert:   (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  alerts:      [],

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar:  ()     => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  addAlert: (alert) =>
    set((s) => ({
      alerts: [
        ...s.alerts,
        { ...alert, id: crypto.randomUUID(), ts: Date.now() } as AlertItem,
      ].slice(-10), // keep max 10 alerts
    })),

  dismissAlert: (id) =>
    set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
}));
