"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Notification {
  id: string; type: string;
  payload: Record<string, string>;
  read: boolean; createdAt: string;
}
interface NationRef { id: string; name: string; color: string; }

interface Props {
  myNationName:  string;
  notifications: Notification[];
  nations:       NationRef[];
}

const TYPE_ICON: Record<string, string> = {
  INCOMING_ATTACK:    "⚠️",
  BATTLE_RESOLVED:    "⚔️",
  DIPLOMACY_PROPOSAL: "📨",
  RESEARCH_COMPLETE:  "🔬",
  WORLD_EVENT:        "🌍",
  SPY_DETECTED:       "🕵️",
  THIEF_DETECTED:     "🦹",
  NATION_DESTROYED:   "💥",
  STARVATION_WARNING: "🌾",
  ALLIANCE_INVITE:    "🤝",
};

export function MessagesContent({ notifications, nations }: Props) {
  const [target,  setTarget]  = useState("");
  const [message, setMessage] = useState("");
  const [busy,    setBusy]    = useState(false);

  async function sendMessage() {
    if (!target || !message.trim() || busy) return;
    setBusy(true);
    const res = await fetch("/api/messages", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ targetNationId: target, message: message.trim() }),
    });
    const data = await res.json() as { error?: string };
    setBusy(false);
    if (!res.ok) { toast.error(data.error ?? "Failed"); return; }
    toast.success("Message sent!");
    setMessage("");
  }

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-100">Messages</h1>
        {unread > 0 && (
          <Badge variant="destructive" className="text-xs">{unread} new</Badge>
        )}
      </div>

      {/* Send message */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-200 text-base">Send Diplomatic Message</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full h-8 text-sm rounded bg-slate-800 border border-slate-700 text-slate-100 px-2"
          >
            <option value="">Select nation…</option>
            {nations.map((n) => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Your message…"
            maxLength={500}
            className="bg-slate-800 border-slate-700 text-slate-100"
          />
          <button
            onClick={sendMessage}
            disabled={busy || !target || !message.trim()}
            className="w-full h-8 text-sm font-semibold rounded bg-blue-800 hover:bg-blue-700 text-white disabled:opacity-40 transition-colors"
          >
            {busy ? "Sending…" : "Send Message"}
          </button>
        </CardContent>
      </Card>

      {/* Inbox */}
      <div className="space-y-2">
        <p className="text-slate-400 text-sm font-medium">
          Inbox ({notifications.length})
        </p>

        {notifications.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-8">
            No notifications yet. Launch an attack or join an alliance to generate events.
          </p>
        )}

        {notifications.map((n) => (
          <div
            key={n.id}
            className={`rounded-lg border px-4 py-3 ${
              !n.read ? "border-blue-900/50 bg-blue-950/10" : "border-slate-800 bg-slate-900"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <span className="text-lg leading-none mt-0.5">
                  {TYPE_ICON[n.type] ?? "📬"}
                </span>
                <div>
                  <p className="text-slate-200 text-sm">
                    {n.type === "DIPLOMACY_PROPOSAL"
                      ? <><span className="font-semibold">{n.payload.from}</span>: {n.payload.message}</>
                      : n.type.replace(/_/g, " ")}
                  </p>
                  {n.type !== "DIPLOMACY_PROPOSAL" && n.payload.message && (
                    <p className="text-slate-400 text-xs mt-0.5">{n.payload.message}</p>
                  )}
                </div>
              </div>
              <span className="text-[10px] text-slate-600 shrink-0">
                {new Date(n.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
