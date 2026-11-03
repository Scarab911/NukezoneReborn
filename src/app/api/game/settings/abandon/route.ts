import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { ENCLAVE } from "@/lib/game-constants";
import { abandonEnclave, type AbandonEnclaveResult } from "@/server/services/nation.service";

const Schema = z.object({
  // Player retypes their enclave name to confirm
  confirmName: z.string().trim().min(1).max(ENCLAVE.NAME_MAX),
});

type AbandonError = Extract<AbandonEnclaveResult, { ok: false }>["error"];

const ERRORS: Record<AbandonError, { message: string; status: number }> = {
  NO_ENCLAVE:    { message: "No enclave",                          status: 404 },
  NAME_MISMATCH: { message: "Name doesn't match your enclave name", status: 400 },
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await abandonEnclave(session.user.id, parsed.data.confirmName);
  if (!result.ok) {
    const { message, status } = ERRORS[result.error];
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ success: true });
}
