// Presence heartbeat — called periodically by <PresenceHeartbeat /> while a
// game tab is visible. No body and naturally idempotent (it only refreshes a
// timestamp), so no validation schema or idempotency key is needed.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { touchPlayerActivity } from "@/server/services/presence.service";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await touchPlayerActivity(session.user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[presence]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
