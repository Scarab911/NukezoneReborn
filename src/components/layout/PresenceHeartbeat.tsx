"use client";

import { useEffect } from "react";

const HEARTBEAT_MS = 60_000;

/** Keeps the player marked online while a game tab is open and visible. */
export function PresenceHeartbeat() {
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/presence", { method: "POST" }).catch(() => {});
    };

    const id = setInterval(beat, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);

  return null;
}
