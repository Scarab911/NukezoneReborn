"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

interface Transaction { id: string; type: string; amount: number; createdAt: string; }

interface Props {
  gold:         number;
  balance:      number;
  transactions: Transaction[];
}

export function BankContent({ gold, balance, transactions }: Props) {
  const router  = useRouter();
  const [amount, setAmount] = useState("");
  const [busy,   setBusy]   = useState(false);

  const num = parseInt(amount) || 0;

  async function act(action: "deposit" | "withdraw") {
    if (num <= 0 || busy) return;
    setBusy(true);
    const res = await fetch("/api/game/bank", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action, amount: num }),
    });
    const data = await res.json() as { error?: string };
    setBusy(false);
    if (!res.ok) { toast.error(data.error ?? "Failed"); return; }
    toast.success(action === "deposit" ? `Deposited ${num.toLocaleString()} gold` : `Withdrew ${num.toLocaleString()} gold`);
    setAmount("");
    router.refresh();
  }

  const txIcon = (type: string) =>
    type === "DEPOSIT" ? "↓" : type === "WITHDRAWAL" ? "↑" : type === "INTEREST" ? "%" : "·";
  const txColor = (type: string) =>
    type === "DEPOSIT" ? "text-green-400" : type === "WITHDRAWAL" ? "text-red-400" : "text-yellow-400";

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Bank</h1>
        <p className="text-slate-500 text-sm mt-0.5">Earn 0.5%/hr interest · 2% withdrawal fee</p>
      </div>

      {/* Balances */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">On Hand</p>
            <p className="text-xl font-bold text-yellow-400 font-mono">💰 {gold.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">In Bank</p>
            <p className="text-xl font-bold text-green-400 font-mono">🏦 {balance.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-200 text-base">Transfer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="number"
            min={1}
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="bg-slate-800 border-slate-700 text-slate-100"
          />
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => act("deposit")}
              disabled={busy || num <= 0 || num > gold}
              className="h-9 text-sm font-semibold rounded bg-green-800 hover:bg-green-700 text-white disabled:opacity-40 transition-colors"
            >
              {busy ? "…" : "Deposit ↓"}
            </button>
            <button
              onClick={() => act("withdraw")}
              disabled={busy || num <= 0}
              className="h-9 text-sm font-semibold rounded bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-40 transition-colors"
            >
              {busy ? "…" : "Withdraw ↑ (−2%)"}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Transaction history */}
      {transactions.length > 0 && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-200 text-sm">Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {transactions.map((tx, i) => (
              <div key={tx.id}>
                {i > 0 && <Separator className="bg-slate-800" />}
                <div className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-400">
                    <span className={`font-bold mr-2 ${txColor(tx.type)}`}>{txIcon(tx.type)}</span>
                    {tx.type.charAt(0) + tx.type.slice(1).toLowerCase()}
                  </span>
                  <div className="text-right">
                    <span className={`font-mono ${txColor(tx.type)}`}>
                      {tx.amount.toLocaleString()}
                    </span>
                    <p className="text-[10px] text-slate-600">
                      {new Date(tx.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
