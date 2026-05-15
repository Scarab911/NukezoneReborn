"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

interface AllianceMember { nationId: string; name: string; color: string; totalUnits: number; role: string; }
interface MyAlliance { id: string; name: string; tag: string; role: string; treasury: number; members: AllianceMember[]; }
interface AllianceSummary { id: string; name: string; tag: string; memberCount: number; treasury: number; totalUnits: number; }

interface Props {
  myNationId: string;
  myAlliance: MyAlliance | null;
  alliances:  AllianceSummary[];
}

const ROLE_COLOR: Record<string, string> = {
  LEADER: "border-yellow-700 text-yellow-400",
  OFFICER: "border-blue-700 text-blue-400",
  MEMBER:  "border-slate-700 text-slate-400",
};

export function AlliancesContent({ myAlliance, alliances }: Props) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [newTag,  setNewTag]  = useState("");
  const [busy,    setBusy]    = useState(false);
  const [joining, setJoining] = useState<string | null>(null);

  async function createAlliance() {
    if (!newName.trim() || !newTag.trim() || busy) return;
    setBusy(true);
    const res = await fetch("/api/alliances", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name: newName.trim(), tag: newTag.trim() }),
    });
    const data = await res.json() as { error?: string };
    setBusy(false);
    if (!res.ok) { toast.error(data.error ?? "Failed"); return; }
    toast.success(`Alliance [${newTag.toUpperCase()}] ${newName} created!`);
    router.refresh();
  }

  async function joinAlliance(allianceId: string) {
    setJoining(allianceId);
    const res = await fetch("/api/alliances/join", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ allianceId }),
    });
    const data = await res.json() as { error?: string };
    setJoining(null);
    if (!res.ok) { toast.error(data.error ?? "Failed"); return; }
    toast.success("Joined alliance!");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Alliances</h1>
        <p className="text-slate-500 text-sm mt-0.5">Forge bonds, share treasury, wage war together</p>
      </div>

      {/* My alliance */}
      {myAlliance ? (
        <Card className="bg-slate-900 border-yellow-900/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-yellow-300 text-base">
                [{myAlliance.tag}] {myAlliance.name}
              </CardTitle>
              <Badge variant="outline" className={ROLE_COLOR[myAlliance.role]}>
                {myAlliance.role}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-4 text-xs font-mono">
              <span className="text-yellow-400">🏦 {myAlliance.treasury.toLocaleString()} treasury</span>
              <span className="text-slate-400">👥 {myAlliance.members.length} members</span>
            </div>
            <Separator className="bg-slate-800" />
            <div className="space-y-1.5 max-h-48 overflow-auto">
              {myAlliance.members.map((m) => (
                <div key={m.nationId} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                    <span className="text-slate-200">{m.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-red-400 text-xs font-mono">{m.totalUnits.toLocaleString()}</span>
                    <Badge variant="outline" className={`text-[10px] ${ROLE_COLOR[m.role]}`}>{m.role}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Create alliance form */
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-slate-200 text-base">Found an Alliance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <p className="text-xs text-slate-500 mb-1">Alliance Name</p>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Iron Pact"
                  className="bg-slate-800 border-slate-700 text-slate-100 h-8 text-sm" />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Tag [2–6]</p>
                <Input value={newTag} onChange={(e) => setNewTag(e.target.value.toUpperCase())} placeholder="IP" maxLength={6}
                  className="bg-slate-800 border-slate-700 text-slate-100 h-8 text-sm font-mono uppercase" />
              </div>
            </div>
            <button onClick={createAlliance} disabled={busy || !newName.trim() || !newTag.trim()}
              className="w-full h-8 text-sm font-semibold rounded bg-yellow-800 hover:bg-yellow-700 text-white disabled:opacity-40 transition-colors">
              {busy ? "Creating…" : "Found Alliance"}
            </button>
          </CardContent>
        </Card>
      )}

      {/* All alliances */}
      <div>
        <p className="text-slate-400 text-sm font-medium mb-3">
          World Alliances ({alliances.length})
        </p>
        {alliances.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-8">No alliances yet — be the first!</p>
        )}
        <div className="space-y-2">
          {alliances.map((a) => (
            <div key={a.id}
              className="flex items-center justify-between px-4 py-3 rounded-lg border border-slate-800 bg-slate-900"
            >
              <div>
                <span className="text-slate-200 font-semibold text-sm">
                  <span className="text-yellow-400 mr-1">[{a.tag}]</span>{a.name}
                </span>
                <div className="flex gap-3 text-xs text-slate-500 mt-0.5">
                  <span>👥 {a.memberCount}</span>
                  <span>⚔️ {a.totalUnits.toLocaleString()} units</span>
                  <span>🏦 {a.treasury.toLocaleString()}</span>
                </div>
              </div>
              {!myAlliance && (
                <button onClick={() => joinAlliance(a.id)} disabled={joining === a.id}
                  className="text-xs px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-40 transition-colors">
                  {joining === a.id ? "Joining…" : "Join"}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
