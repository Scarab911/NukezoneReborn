"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface Props {
  unitTypeId:     string;
  unitName:       string;
  goldCost:       number;
  steelCost:      number;
  availableGold:  number;
  availableSteel: number;
}

export function ArsenalTrainForm({
  unitTypeId, unitName, goldCost, steelCost, availableGold, availableSteel,
}: Props) {
  const router  = useRouter();
  const [qty,   setQty]     = useState(1);
  const [busy,  setBusy]    = useState(false);

  const totalGold  = qty * goldCost;
  const totalSteel = qty * steelCost;
  const canAfford  = availableGold >= totalGold && availableSteel >= totalSteel;

  async function train() {
    if (!canAfford || busy) return;
    setBusy(true);

    const res = await fetch("/api/military/train", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ unitTypeId, quantity: qty }),
    });

    const data = await res.json() as { error?: string };
    setBusy(false);

    if (!res.ok) {
      toast.error(data.error ?? "Training failed");
      return;
    }

    toast.success(`Training ${qty}× ${unitName}`);
    setQty(1);
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <Input
        type="number"
        min={1}
        max={9999}
        value={qty}
        onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
        className="w-20 h-7 text-xs bg-slate-800 border-slate-700 text-slate-100"
      />
      <button
        onClick={train}
        disabled={!canAfford || busy}
        className="flex-1 h-7 text-xs font-semibold rounded bg-red-800 hover:bg-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-2"
      >
        {busy ? "Training…" : `Train (💰${totalGold.toLocaleString()})`}
      </button>
    </div>
  );
}
