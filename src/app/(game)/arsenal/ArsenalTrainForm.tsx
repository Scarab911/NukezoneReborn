"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface Props {
  unitTypeId:     string;
  unitName:       string;
  moneyCost:      number;
  availableMoney: number;
  /** Housing space one unit takes. */
  space:          number;
  /** Free space left in this unit's housing building (negative when over capacity). */
  freeSpace:      number;
  housingLabel:   string;
}

export function ArsenalTrainForm({
  unitTypeId, unitName, moneyCost, availableMoney, space, freeSpace, housingLabel,
}: Props) {
  const router  = useRouter();
  const [qty,   setQty]  = useState(1);
  const [busy,  setBusy] = useState(false);

  const total     = qty * moneyCost;
  const canAfford = availableMoney >= total;
  const fits      = qty * space <= freeSpace;
  const maxFit    = Math.max(0, Math.floor(freeSpace / space));

  async function train() {
    if (!canAfford || !fits || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/military/train", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ unitTypeId, quantity: qty }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { toast.error(data.error ?? "Training failed"); return; }
      toast.success(`Training ${qty}× ${unitName}`);
      setQty(1);
      router.refresh();
    } catch {
      toast.error("Training failed: network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Input
          type="number" min={1} max={9999} value={qty}
          onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
          className="w-20 h-7 text-xs bg-slate-800 border-slate-700 text-slate-100"
        />
        <button
          onClick={train}
          disabled={!canAfford || !fits || busy}
          className="flex-1 h-7 text-xs font-semibold rounded bg-red-800 hover:bg-red-700 text-white disabled:opacity-40 transition-colors px-2"
        >
          {busy ? "Training…" : `Train (💰${total.toLocaleString()})`}
        </button>
      </div>
      {!fits && (
        <p className="text-[11px] text-orange-400">
          {freeSpace < 0
            ? `${housingLabel} over capacity: build more to train`
            : `Room for ${maxFit} more: build more ${housingLabel}`}
        </p>
      )}
    </div>
  );
}
