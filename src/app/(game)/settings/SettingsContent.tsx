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
  const [abandoning,   setAbandoning]   = useState(false);
  const [confirmName,  setConfirmName]  = useState("");
  const [abandonBusy,  setAbandonBusy]  = useState(false);

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

  const canAbandon = confirmName.trim().toLowerCase() === nationName.toLowerCase() && !abandonBusy;

  async function abandonEnclave() {
    if (!canAbandon) return;
    setAbandonBusy(true);
    const res = await fetch("/api/game/settings/abandon", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": crypto.randomUUID() },
      body:    JSON.stringify({ confirmName: confirmName.trim() }),
    });
    const data = await res.json() as { error?: string };
    if (!res.ok) { setAbandonBusy(false); toast.error(data.error ?? "Could not abandon enclave"); return; }
    toast.success(`${nationName} has been abandoned`);
    router.push("/setup");
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
        <CardContent className="space-y-3">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full h-8 text-sm font-semibold rounded border border-red-900 text-red-400 hover:bg-red-950/50 transition-colors"
          >
            Sign Out
          </button>

          <Separator className="bg-slate-800" />

          {!abandoning ? (
            <div className="space-y-1.5">
              <button
                onClick={() => setAbandoning(true)}
                className="w-full h-8 text-sm font-semibold rounded bg-red-950/60 border border-red-800 text-red-300 hover:bg-red-900/60 transition-colors"
              >
                Abandon Enclave
              </button>
              <p className="text-xs text-slate-500">
                Give up {nationName} and found a new enclave from scratch.
              </p>
            </div>
          ) : (
            <div className="space-y-2 rounded border border-red-800/60 bg-red-950/20 p-3">
              <p className="text-sm text-red-300 font-semibold">
                ⚠️ This permanently ends {nationName}.
              </p>
              <p className="text-xs text-slate-400">
                All land, money, buildings and units are lost. You will start a new enclave from the beginning.
                Type <span className="font-mono text-slate-200">{nationName}</span> to confirm.
              </p>
              <Input
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={nationName}
                maxLength={32}
                className="bg-slate-800 border-slate-700 text-slate-100 h-8 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={abandonEnclave}
                  disabled={!canAbandon}
                  className="flex-1 h-8 text-sm font-semibold rounded bg-red-700 hover:bg-red-600 text-white disabled:opacity-40 transition-colors"
                >
                  {abandonBusy ? "Abandoning…" : "Abandon forever"}
                </button>
                <button
                  onClick={() => { setAbandoning(false); setConfirmName(""); }}
                  disabled={abandonBusy}
                  className="px-4 h-8 text-sm font-semibold rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
