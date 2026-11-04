"use client";

import { useSyncExternalStore } from "react";
import { HOUSING_LABEL } from "@/lib/housing";
import type { HousingBuilding } from "@/lib/game-constants";

export interface Overflow {
  building:    HousingBuilding;
  /** Space over capacity. */
  excessSpace: number;
  /** ISO time the excess units desert. */
  deadline:    string;
}

// A clock that ticks every 30s; the snapshot is stable within each step
const CLOCK_STEP_MS = 30_000;
function subscribeClock(onChange: () => void): () => void {
  const id = setInterval(onChange, CLOCK_STEP_MS);
  return () => clearInterval(id);
}
function clockSnapshot(): number {
  return Math.floor(Date.now() / CLOCK_STEP_MS) * CLOCK_STEP_MS;
}

function formatLeft(ms: number): string {
  if (ms <= 0) return "now";
  const mins = Math.ceil(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Warns about housing over capacity, with a live countdown to desertion. */
export function OverflowBanner({ overflows }: { overflows: Overflow[] }) {
  // null during SSR/hydration, so server and client render the same markup first
  const now = useSyncExternalStore(subscribeClock, clockSnapshot, () => null);

  if (overflows.length === 0) return null;

  return (
    <div className="space-y-2">
      {overflows.map((o) => {
        const label = HOUSING_LABEL[o.building];
        return (
          <div key={o.building} className="bg-red-950/40 border border-red-800/60 rounded-lg px-4 py-3 text-sm">
            <p className="text-red-300 font-semibold">
              ⚠️ {label} over capacity: {o.excessSpace.toLocaleString()} space unhoused
            </p>
            <p className="text-red-200/70 text-xs mt-1">
              Build more {label}{" "}
              {now !== null && (
                <>
                  within <span className="font-mono text-red-200">{formatLeft(new Date(o.deadline).getTime() - now)}</span>{" "}
                  ({new Date(o.deadline).toLocaleString()}){" "}
                </>
              )}
              or the excess units desert.
              Training these units is blocked until they fit.
            </p>
          </div>
        );
      })}
    </div>
  );
}
