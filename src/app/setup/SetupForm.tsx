"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

interface Props {
  /** Name of the player's previous enclave if it was destroyed. */
  destroyedName: string | null;
}

export function SetupForm({ destroyedName }: Props) {
  const router = useRouter();
  const [nationName, setNationName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/game/nation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nationName }),
    });

    const data = await res.json() as { error?: string };

    if (!res.ok) {
      setError(data.error ?? "Failed to create enclave.");
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
          <h1 className="text-2xl font-bold text-slate-100">
            {destroyedName ? "Rise From the Ashes" : "Found Your Enclave"}
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            {destroyedName
              ? <>Your enclave <span className="text-slate-200 font-semibold">{destroyedName}</span> was destroyed. Choose a new name and start over.</>
              : "Choose a name. This will be your identity in the nuclear age."}
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
                <Label htmlFor="nationName" className="text-slate-300">Enclave Name</Label>
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
            </CardContent>

            <CardFooter>
              <Button
                type="submit"
                disabled={loading || nationName.length < 2}
                className="w-full bg-red-700 hover:bg-red-600 text-white font-semibold tracking-wide"
              >
                {loading ? "Founding enclave..." : "Found Enclave"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
