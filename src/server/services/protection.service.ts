import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { COMBAT, ECONOMY } from "@/lib/game-constants";

const HOUR_MS = 3_600_000;

/** When a newly founded enclave's protection ends. */
export function newPlayerProtectionUntil(now = new Date()): Date {
  return new Date(now.getTime() + ECONOMY.PROTECTION_HOURS * HOUR_MS);
}

/** A shield is over once protectedUntil has passed (or was never set). */
export function protectionExpired(protectedUntil: Date | null): boolean {
  return protectedUntil === null || Date.now() > protectedUntil.getTime();
}

/** Lazily lifts an expired shield. Returns true if the enclave is no longer protected. */
export async function liftProtectionIfExpired(
  nationId: string,
  protectedUntil: Date | null,
): Promise<boolean> {
  if (!protectionExpired(protectedUntil)) return false;
  await prisma.nation.updateMany({
    where: { id: nationId, status: "PROTECTED" },
    data:  { status: "ACTIVE", protectedUntil: null },
  });
  return true;
}

/** Ends a shield early — the enclave chose to attack. */
export async function removeProtection(nationId: string): Promise<void> {
  await prisma.nation.updateMany({
    where: { id: nationId, status: "PROTECTED" },
    data:  { status: "ACTIVE", protectedUntil: null },
  });
}

/**
 * Shields an enclave that was knocked down to the land floor.
 * Never shortens an existing longer shield. Returns the shield end.
 */
export async function grantRuinShield(
  tx: Prisma.TransactionClient,
  nationId: string,
): Promise<Date> {
  const until = new Date(Date.now() + COMBAT.RUIN_SHIELD_HOURS * HOUR_MS);
  const current = await tx.nation.findUniqueOrThrow({
    where:  { id: nationId },
    select: { status: true, protectedUntil: true },
  });
  if (current.status === "PROTECTED" && current.protectedUntil && current.protectedUntil > until) {
    return current.protectedUntil;
  }
  await tx.nation.update({
    where: { id: nationId },
    data:  { status: "PROTECTED", protectedUntil: until },
  });
  return until;
}
