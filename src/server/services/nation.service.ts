import { prisma } from "@/lib/db";
import type { Nation, Resource, MoraleRecord, Prisma } from "@prisma/client";
import { BUILDINGS, ECONOMY, ENCLAVE, POWER, TURNS } from "@/lib/game-constants";
import { newPlayerProtectionUntil } from "@/server/services/protection.service";

const WORLD_ID = "world_01";

export type FoundEnclaveResult =
  | { ok: true; nationId: string }
  | { ok: false; error: "ACTIVE_ENCLAVE_EXISTS" | "NAME_TAKEN" };

export type RenameEnclaveResult =
  | { ok: true }
  | { ok: false; error: "NO_ENCLAVE" | "SAME_NAME" | "NO_RENAMES_LEFT" | "NAME_TAKEN" };

/**
 * A name is taken if any living (non-destroyed) enclave in the world uses it,
 * case-insensitively. Names of destroyed enclaves are free to reuse.
 */
async function isEnclaveNameTaken(
  db: Prisma.TransactionClient,
  name: string,
  excludeNationId?: string,
): Promise<boolean> {
  const hit = await db.nation.findFirst({
    where: {
      worldId: WORLD_ID,
      name:    { equals: name, mode: "insensitive" },
      status:  { not: "DESTROYED" },
      ...(excludeNationId && { NOT: { id: excludeNationId } }),
    },
    select: { id: true },
  });
  return hit !== null;
}

function randomEnclaveColor(): string {
  return ENCLAVE.COLORS[Math.floor(Math.random() * ENCLAVE.COLORS.length)];
}

/**
 * Found a new enclave for the player. If their current enclave was destroyed,
 * it is detached (kept for battle history) and a fresh one is created.
 */
export async function foundEnclave(playerId: string, name: string): Promise<FoundEnclaveResult> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.nation.findUnique({
      where:  { playerId },
      select: { id: true, status: true },
    });
    if (current && current.status !== "DESTROYED") {
      return { ok: false, error: "ACTIVE_ENCLAVE_EXISTS" } as const;
    }
    if (await isEnclaveNameTaken(tx, name)) {
      return { ok: false, error: "NAME_TAKEN" } as const;
    }

    if (current) {
      await tx.nation.update({
        where: { id: current.id },
        data:  { playerId: null, formerPlayerId: playerId },
      });
    }

    const n = await tx.nation.create({
      data: {
        worldId:      WORLD_ID,
        playerId,
        name,
        color:        randomEnclaveColor(),
        status:         "PROTECTED",
        protectedUntil: newPlayerProtectionUntil(),
        turns:       TURNS.STARTING_TURNS,
        maxTurns:     TURNS.MAX_TURNS,
        turnsRegenAt: new Date(),
      },
    });

    await tx.resource.create({
      data: {
        nationId: n.id,
        money:    ECONOMY.STARTING_MONEY,
        // Starting barracks and power plant stand on the starting land
        land:     ECONOMY.STARTING_LAND
                  - (BUILDINGS.STARTING_BARRACKS + POWER.STARTING_PLANTS) * BUILDINGS.LAND_PER_BUILDING,
        energy:   ECONOMY.STARTING_ENERGY,
      },
    });
    await tx.moraleRecord.create({ data: { nationId: n.id, morale: ECONOMY.STARTING_MORALE } });
    await tx.bankAccount.create({ data: { nationId: n.id, balance: 0 } });
    await tx.cIRating.create({ data: { nationId: n.id, rating: 10 } });
    await tx.army.create({ data: { nationId: n.id, name: "Home Guard", status: "STATIONED" } });
    await tx.building.createMany({
      data: [
        { nationId: n.id, type: "BARRACKS",    count: BUILDINGS.STARTING_BARRACKS },
        { nationId: n.id, type: "POWER_PLANT", count: POWER.STARTING_PLANTS },
      ],
    });

    return { ok: true, nationId: n.id } as const;
  });
}

/** Rename the player's living enclave, spending one rename. */
export async function renameEnclave(playerId: string, name: string): Promise<RenameEnclaveResult> {
  return prisma.$transaction(async (tx) => {
    const nation = await tx.nation.findUnique({
      where:  { playerId },
      select: { id: true, name: true, status: true, nameChangesLeft: true },
    });
    if (!nation || nation.status === "DESTROYED") return { ok: false, error: "NO_ENCLAVE" } as const;
    if (nation.name === name)                     return { ok: false, error: "SAME_NAME" } as const;
    if (nation.nameChangesLeft <= 0)              return { ok: false, error: "NO_RENAMES_LEFT" } as const;
    if (await isEnclaveNameTaken(tx, name, nation.id)) {
      return { ok: false, error: "NAME_TAKEN" } as const;
    }

    // Conditional update guards against two concurrent renames both passing the check
    const { count } = await tx.nation.updateMany({
      where: { id: nation.id, nameChangesLeft: { gt: 0 } },
      data:  { name, nameChangesLeft: { decrement: 1 } },
    });
    if (count === 0) return { ok: false, error: "NO_RENAMES_LEFT" } as const;

    return { ok: true } as const;
  });
}

/**
 * Removes an enclave from its alliance. A departing leader hands over to the
 * longest-serving remaining member; an alliance left with no members is disbanded.
 */
async function leaveAlliance(tx: Prisma.TransactionClient, nationId: string): Promise<void> {
  const membership = await tx.allianceMember.findUnique({ where: { nationId } });
  if (!membership) return;

  await tx.allianceMember.delete({ where: { id: membership.id } });

  const successor = await tx.allianceMember.findFirst({
    where:   { allianceId: membership.allianceId },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
  });
  if (!successor) {
    await tx.alliance.update({ where: { id: membership.allianceId }, data: { status: "DISBANDED" } });
    return;
  }
  if (membership.role === "LEADER") {
    await tx.allianceMember.update({ where: { id: successor.id }, data: { role: "LEADER" } });
  }
}

export type AbandonEnclaveResult =
  | { ok: true }
  | { ok: false; error: "NO_ENCLAVE" | "NAME_MISMATCH" };

/**
 * The player gives up their enclave to start over. It is marked DESTROYED and
 * removed from its alliance; the game layout then sends the player to /setup.
 * `confirmName` must match the enclave name (case-insensitive) as a safety check.
 */
export async function abandonEnclave(playerId: string, confirmName: string): Promise<AbandonEnclaveResult> {
  return prisma.$transaction(async (tx) => {
    const nation = await tx.nation.findUnique({
      where:  { playerId },
      select: { id: true, name: true, status: true },
    });
    if (!nation || nation.status === "DESTROYED") return { ok: false, error: "NO_ENCLAVE" } as const;
    if (nation.name.toLowerCase() !== confirmName.trim().toLowerCase()) {
      return { ok: false, error: "NAME_MISMATCH" } as const;
    }

    await leaveAlliance(tx, nation.id);
    await tx.nation.update({
      where: { id: nation.id },
      data:  { status: "DESTROYED", protectedUntil: null },
    });
    return { ok: true } as const;
  });
}

/** Name of the player's enclave if it has been destroyed (shown on the setup screen). */
export async function getDestroyedEnclaveName(playerId: string): Promise<string | null> {
  const nation = await prisma.nation.findUnique({
    where:  { playerId },
    select: { name: true, status: true },
  });
  return nation?.status === "DESTROYED" ? nation.name : null;
}

/** Whether the player owns a living (non-destroyed) enclave. */
export async function hasLivingEnclave(playerId: string): Promise<boolean> {
  const nation = await prisma.nation.findUnique({
    where:  { playerId },
    select: { status: true },
  });
  return nation !== null && nation.status !== "DESTROYED";
}

export type NationSnapshot = Nation & {
  resource:  Resource | null;
  morale:    MoraleRecord | null;
};

export async function getNationByPlayerId(playerId: string): Promise<NationSnapshot | null> {
  return prisma.nation.findUnique({
    where: { playerId },
    include: { resource: true, morale: true },
  });
}

export async function getNationById(nationId: string): Promise<NationSnapshot | null> {
  return prisma.nation.findUnique({
    where: { id: nationId },
    include: { resource: true, morale: true },
  });
}

/** Total nations ever founded (all statuses, including destroyed). */
export async function countNationsFounded(): Promise<number> {
  return prisma.nation.count();
}

export async function getNationsByWorld(worldId: string): Promise<NationSnapshot[]> {
  return prisma.nation.findMany({
    where: { worldId, status: { in: ["ACTIVE", "PROTECTED"] } },
    include: { resource: true, morale: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function setNationStatus(
  nationId: string,
  status: Nation["status"],
): Promise<void> {
  await prisma.nation.update({ where: { id: nationId }, data: { status } });
}
