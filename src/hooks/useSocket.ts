"use client";

import { useEffect } from "react";
import { getSocket } from "@/lib/socket";

// Call once from the root game layout — initialises the WS connection
// and silently skips if the WS server is not running (graceful dev degradation).
export function useSocketInit(): void {
  useEffect(() => {
    try { getSocket(); } catch { /* WS server not running — ignore */ }
    // Intentionally no disconnect on unmount: the socket is a singleton
    // that lives for the entire session.
  }, []);
}
