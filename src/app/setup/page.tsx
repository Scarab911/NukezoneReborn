"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

const COLORS = [
  { value: "#ef4444", label: "Red" },
  { value: "#f97316", label: "Orange" },
  { value: "#eab308", label: "Yellow" },
  { value: "#22c55e", label: "Green" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#a855f7", label: "Purple" },
  { value: "#ec4899", label: "Pink" },
  { value: "#14b8a6", label: "Teal" },
];

export default function SetupPage() {
  const router = useRouter();
  const [nationName, setNationName] = useState("");
  const [color, setColor] = useState("#ef4444");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/game/nation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nationName, color }),
    });

    const data = await res.json() as { error?: string };

    if (!res.ok) {
      setError(data.error ?? "Failed to create nation.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <Zap className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-slate-100">Found Your Nation</h1>
          <p className="text-slate-400 text-sm mt-2">
            Choose a name and color. This will be your identity in the nuclear age.
          </p>
        </div>

        <Card className="border-slate-800 bg-slate-900">
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6 pt-6">
              {error && (
                <p className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded px-3 py-2">
                  {error}
                </p>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="nationName" className="text-slate-300">Nation Name</Label>
                <Input
                  id="nationName"
                  placeholder="e.g. Iron Dominion"
                  value={nationName}
                  onChange={(e) => setNationName(e.target.value)}
                  required
                  maxLength={32}
                  className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500"
                />
                <p className="text-xs text-slate-500">{nationName.length}/32 characters</p>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Nation Color</Label>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setColor(c.value)}
                      title={c.label}
                      className="w-8 h-8 rounded-full border-2 transition-all"
                      style={{
                        backgroundColor: c.value,
                        borderColor: color === c.value ? "white" : "transparent",
                        scale: color === c.value ? "1.15" : "1",
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="rounded border border-slate-700 bg-slate-800/50 p-4 flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <div>
                  <p className="text-slate-200 font-semibold text-sm">
                    {nationName || "Your Nation"}
                  </p>
                  <p className="text-slate-500 text-xs">New nation · World 1</p>
                </div>
              </div>
            </CardContent>

            <CardFooter>
              <Button
                type="submit"
                disabled={loading || nationName.length < 2}
                className="w-full bg-red-700 hover:bg-red-600 text-white font-semibold tracking-wide"
              >
                {loading ? "Founding nation..." : "Found Nation"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
