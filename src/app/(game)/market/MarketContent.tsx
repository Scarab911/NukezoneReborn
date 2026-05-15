"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

type Side = "BUY" | "SELL";
type Resource = "GOLD" | "STEEL" | "FOOD" | "ENERGY";

interface Order {
  id: string; side: Side; resource: Resource;
  quantity: number; filledQty: number; pricePerUnit: number;
  isOwn?: boolean; createdAt?: string;
}

interface Props {
  resources: { gold: number; steel: number; food: number; energy: number };
  openOrders: Order[];
  myOrders:   Order[];
}

const RESOURCES: Resource[] = ["GOLD", "STEEL", "FOOD", "ENERGY"];
const RESOURCE_EMOJI: Record<Resource, string> = {
  GOLD: "💰", STEEL: "⚙️", FOOD: "🌾", ENERGY: "⚡",
};

export function MarketContent({ resources, openOrders, myOrders }: Props) {
  const router = useRouter();
  const [side,     setSide]     = useState<Side>("BUY");
  const [resource, setResource] = useState<Resource>("STEEL");
  const [qty,      setQty]      = useState("100");
  const [price,    setPrice]    = useState("10");
  const [busy,     setBusy]     = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  async function placeOrder() {
    const q = parseInt(qty);
    const p = parseInt(price);
    if (!q || !p || busy) return;
    setBusy(true);
    const res = await fetch("/api/game/market", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ side, resource, quantity: q, pricePerUnit: p }),
    });
    const data = await res.json() as { error?: string };
    setBusy(false);
    if (!res.ok) { toast.error(data.error ?? "Failed"); return; }
    toast.success(`${side} order placed`);
    router.refresh();
  }

  async function cancelOrder(id: string) {
    setCancelling(id);
    const res = await fetch(`/api/game/market?id=${id}`, { method: "DELETE" });
    setCancelling(null);
    if (!res.ok) { toast.error("Cancel failed"); return; }
    toast.success("Order cancelled");
    router.refresh();
  }

  const sells  = openOrders.filter((o) => o.side === "SELL").slice(0, 15);
  const buys   = openOrders.filter((o) => o.side === "BUY").slice(0, 15);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Market</h1>
        <p className="text-slate-500 text-sm mt-0.5">Player-driven resource trading · 5% sell tax</p>
      </div>

      {/* Resources */}
      <div className="flex flex-wrap gap-3 text-xs font-mono">
        <span className="text-yellow-400">💰 {resources.gold.toLocaleString()}</span>
        <span className="text-slate-300">⚙️ {resources.steel.toLocaleString()}</span>
        <span className="text-green-400">🌾 {resources.food.toLocaleString()}</span>
        <span className="text-blue-400">⚡ {resources.energy.toLocaleString()}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Order form */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-slate-200 text-base">Place Order</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Side toggle */}
            <div className="grid grid-cols-2 gap-2">
              {(["BUY", "SELL"] as Side[]).map((s) => (
                <button key={s} onClick={() => setSide(s)}
                  className={`h-8 text-sm font-semibold rounded transition-colors ${
                    side === s
                      ? s === "BUY" ? "bg-green-800 text-white" : "bg-red-800 text-white"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                  }`}
                >{s}</button>
              ))}
            </div>

            {/* Resource selector */}
            <div className="grid grid-cols-4 gap-1">
              {RESOURCES.map((r) => (
                <button key={r} onClick={() => setResource(r)}
                  className={`h-8 text-xs rounded transition-colors ${
                    resource === r ? "bg-slate-700 text-slate-100 border border-slate-500" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                  }`}
                >{RESOURCE_EMOJI[r]} {r}</button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-slate-500 mb-1">Quantity</p>
                <Input value={qty} onChange={(e) => setQty(e.target.value)} type="number" min={10} className="bg-slate-800 border-slate-700 text-slate-100 h-8 text-sm" />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Price/unit</p>
                <Input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min={1} className="bg-slate-800 border-slate-700 text-slate-100 h-8 text-sm" />
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Total: {(parseInt(qty) * parseInt(price) || 0).toLocaleString()} gold
              {side === "SELL" && " (−5% tax on proceeds)"}
            </p>

            <button onClick={placeOrder} disabled={busy}
              className={`w-full h-9 text-sm font-semibold rounded text-white disabled:opacity-40 transition-colors ${
                side === "BUY" ? "bg-green-800 hover:bg-green-700" : "bg-red-800 hover:bg-red-700"
              }`}
            >{busy ? "Placing…" : `Place ${side} Order`}</button>
          </CardContent>
        </Card>

        {/* My orders */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-slate-200 text-base">My Open Orders ({myOrders.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-72 overflow-auto">
            {myOrders.length === 0 && <p className="text-slate-500 text-sm text-center py-4">No open orders</p>}
            {myOrders.map((o) => (
              <div key={o.id} className="flex items-center justify-between text-xs bg-slate-800 rounded px-3 py-2">
                <div>
                  <span className={`font-bold mr-1 ${o.side === "BUY" ? "text-green-400" : "text-red-400"}`}>{o.side}</span>
                  <span className="text-slate-300">{RESOURCE_EMOJI[o.resource]} {o.quantity - o.filledQty} @ {o.pricePerUnit}</span>
                </div>
                <button onClick={() => cancelOrder(o.id)} disabled={cancelling === o.id}
                  className="text-slate-500 hover:text-red-400 transition-colors ml-2"
                >✕</button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Order book */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { label: "Sell Orders", orders: sells, color: "text-red-400" },
          { label: "Buy Orders",  orders: buys,  color: "text-green-400" },
        ].map(({ label, orders, color }) => (
          <Card key={label} className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className={`text-sm ${color}`}>{label}</CardTitle>
            </CardHeader>
            <CardContent>
              {orders.length === 0
                ? <p className="text-slate-500 text-xs text-center py-3">No orders</p>
                : (
                  <div className="space-y-0">
                    {orders.map((o, i) => (
                      <div key={o.id}>
                        {i > 0 && <Separator className="bg-slate-800" />}
                        <div className="flex justify-between items-center py-1.5 text-xs">
                          <span className="text-slate-400">
                            {RESOURCE_EMOJI[o.resource]} {(o.quantity - o.filledQty).toLocaleString()}
                          </span>
                          <div className="text-right">
                            <span className={`font-mono ${color}`}>{o.pricePerUnit} ea</span>
                            {o.isOwn && <Badge variant="outline" className="ml-1 text-[9px] border-slate-700 text-slate-500 py-0">you</Badge>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
