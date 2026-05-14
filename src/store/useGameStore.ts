"use client";

import { create } from "zustand";
import type { EconomyUpdatePayload, WorldEventPayload } from "@/types/socket";

interface GameState {
  // Live economy (updated by WS economy:update)
  resources: EconomyUpdatePayload | null;
  activeWorldEvent: WorldEventPayload | null;
  completedResearch: string[];

  // Actions
  setResources:          (data: EconomyUpdatePayload) => void;
  setWorldEvent:         (data: WorldEventPayload) => void;
  clearWorldEvent:       (eventId: string) => void;
  addCompletedResearch:  (techNodeId: string) => void;
}

export const useGameStore = create<GameState>((set) => ({
  resources:          null,
  activeWorldEvent:   null,
  completedResearch:  [],

  setResources:         (data) => set({ resources: data }),
  setWorldEvent:        (data) => set({ activeWorldEvent: data }),
  clearWorldEvent:      (id)   => set((s) => s.activeWorldEvent?.eventId === id ? { activeWorldEvent: null } : s),
  addCompletedResearch: (id)   => set((s) => ({ completedResearch: [...s.completedResearch, id] })),
}));
