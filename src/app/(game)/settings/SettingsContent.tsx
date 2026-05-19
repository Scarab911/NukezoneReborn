"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

const COLORS = [
  "#ef4444","#f97316","#eab308","#22c55e",
  "#3b82f6","#a855f7","#ec4899","#14b8a6",
];

interface Props {
  nationName:   string;
  nationColor:  string;
  nationStatus: string;
  email:        string;
  displayName:  string;
  memberSince:  string;
  land:         number;
  totalUnits:   number;
}

export function SettingsContent({
  nationName, nationColor, nationStatus, email, displayName, memberSince, land, totalUnits,
}: Props) {
  const router = useRouter();
  const [color,    setColor]    = useState(nationColor);
  const [newName,  setNewName]  = useState(nationName);
  const [busy,     setBusy]     = useState(false);

  async function saveNation() {
    if (!newName.trim() || busy) return;
    setBusy(true);
    const res = await fetch("/api/game/settings/nation", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ color, nationName: newName.trim() }),
    });
    const data = await res.json() as { error?: string };
    setBusy(false);
    if (!res.ok) { toast.error(data.error ?? "Save failed"); return; }
    toast.success("Nation settings saved");
    router.refresh();
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
        <p className="text-slate-500 text-sm mt-0.5">Account and nation preferences</p>
      </div>

      {/* Account info */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-200 text-sm">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Email</span>
            <span className="text-slate-300 font-mono text-xs">{email}</span>
          </div>
          <Separator className="bg-slate-800" />
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Member since</span>
            <span className="text-slate-300 text-xs">{new Date(memberSince).toLocaleDateString()}</span>
          </div>
          <Separator className="bg-slate-800" />
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Display name</span>
            <span className="text-slate-300 text-xs">{displayName}</span>
          </div>
        </CardContent>
      </Card>

      {/* Nation settings */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-200 text-sm">Nation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Status</span>
            <Badge variant="outline" className={
              nationStatus === "PROTECTED" ? "border-blue-700 text-blue-400" : "border-green-700 text-green-400"
            }>
              {nationStatus}
            </Badge>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Land</span>
            <span className="text-green-400 font-mono text-xs">{land.toLocaleString()} tiles</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Total units</span>
            <span className="text-red-400 font-mono text-xs">{totalUnits.toLocaleString()}</span>
          </div>

          <Separator className="bg-slate-800" />

          <div className="space-y-1.5">
            <p className="text-xs text-slate-500">Nation Name</p>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={32}
              className="bg-slate-800 border-slate-700 text-slate-100 h-8 text-sm"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs text-slate-500">Nation Color</p>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-8 h-8 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? "white" : "transparent",
                    transform:   color === c ? "scale(1.15)" : "scale(1)",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="flex items-center gap-3 rounded border border-slate-700 bg-slate-800/50 px-3 py-2">
            <span className="w-4 h-4 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-slate-200 text-sm font-semibold">{newName || "Your Nation"}</span>
          </div>

          <button
            onClick={saveNation}
            disabled={busy}
            className="w-full h-8 text-sm font-semibold rounded bg-blue-800 hover:bg-blue-700 text-white disabled:opacity-40 transition-colors"
          >
            {busy ? "Saving…" : "Save Nation Settings"}
          </button>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="bg-slate-900 border-red-900/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-red-400 text-sm">Account Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full h-8 text-sm font-semibold rounded border border-red-900 text-red-400 hover:bg-red-950/50 transition-colors"
          >
            Sign Out
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
