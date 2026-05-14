"use client";

import { useUIStore } from "@/store/useUIStore";
import { useSocketInit } from "@/hooks/useSocket";
import { X } from "lucide-react";

export function AlertBar() {
  useSocketInit(); // initialise WS connection from here

  const { alerts, dismissAlert } = useUIStore();
  const urgent = alerts.filter((a) => a.type === "INCOMING_ATTACK");

  if (urgent.length === 0) return null;

  return (
    <div className="bg-red-950 border-b border-red-800 px-4 py-2 space-y-1">
      {urgent.map((alert) => (
        <div key={alert.id} className="flex items-center justify-between text-sm">
          <span className="text-red-200 font-semibold animate-pulse">
            ⚠️ INCOMING ATTACK —{" "}
            {"eta" in alert.data
              ? `ETA ${new Date(alert.data.eta).toLocaleTimeString()}`
              : ""}
          </span>
          <button
            onClick={() => dismissAlert(alert.id)}
            className="text-red-400 hover:text-red-200 ml-4"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
