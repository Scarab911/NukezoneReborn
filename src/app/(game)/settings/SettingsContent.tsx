"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

interface Props {
  nationName:      string;
  nationStatus:    string;
  nameChangesLeft: number;
  email:           string;
  memberSince:  string;
  land:         number;
  totalUnits:   number;
}

export function SettingsContent({
  nationName, nationStatus, nameChangesLeft, email, memberSince, land, totalUnits,
}: Props) {
  const router = useRouter();
  const [newName,  setNewName]  = useState(nationName);
  const [busy,     setBusy]     = useState(false);

  const trimmed   = newName.trim();
  const canRename = nameChangesLeft > 0 && trimmed.length >= 2 && trimmed !== nationName && !busy;

  async function renameEnclave() {
    if (!canRename) return;
    setBusy(true);
    const res = await fetch("/api/game/settings/nation", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ nationName: trimmed }),
    });
    const data = await res.json() as { error?: string };
    setBusy(false);
    if (!res.ok) { toast.error(data.error ?? "Rename failed"); return; }
    toast.success(`Enclave renamed to ${trimmed}`);
    router.refresh();
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
        <p className="text-slate-500 text-sm mt-0.5">Account and enclave preferences</p>
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
        </CardContent>
      </Card>

      {/* Enclave settings */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-200 text-sm">Enclave</CardTitle>
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
            <p className="text-xs text-slate-500">Enclave Name</p>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={32}
              disabled={nameChangesLeft <= 0}
              className="bg-slate-800 border-slate-700 text-slate-100 h-8 text-sm"
            />
            <p className="text-xs text-slate-500">
              {nameChangesLeft > 0
                ? `You can change your enclave name ${nameChangesLeft} more ${nameChangesLeft === 1 ? "time" : "times"}. This can't be undone.`
                : "You have no name changes left."}
            </p>
          </div>

          <button
            onClick={renameEnclave}
            disabled={!canRename}
            className="w-full h-8 text-sm font-semibold rounded bg-blue-800 hover:bg-blue-700 text-white disabled:opacity-40 transition-colors"
          >
            {busy ? "Renaming…" : "Change Name"}
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
