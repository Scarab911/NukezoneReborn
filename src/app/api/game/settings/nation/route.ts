import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { ENCLAVE } from "@/lib/game-constants";
import { renameEnclave, type RenameEnclaveResult } from "@/server/services/nation.service";

const Schema = z.object({
  nationName: z.string().trim().min(ENCLAVE.NAME_MIN).max(ENCLAVE.NAME_MAX),
});

type RenameError = Extract<RenameEnclaveResult, { ok: false }>["error"];

const ERRORS: Record<RenameError, { message: string; status: number }> = {
  NO_ENCLAVE:      { message: "No enclave",                    status: 404 },
  SAME_NAME:       { message: "That is already your name",     status: 400 },
  NO_RENAMES_LEFT: { message: "No name changes left",          status: 403 },
  NAME_TAKEN:      { message: "Name already taken",            status: 409 },
};

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await renameEnclave(session.user.id, parsed.data.nationName);
  if (!result.ok) {
    const { message, status } = ERRORS[result.error];
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ success: true });
}
