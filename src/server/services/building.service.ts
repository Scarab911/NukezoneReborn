// Construction — one atomic transaction: turns, money and land are spent with
// guarded decrements, so concurrent requests can never overspend.
import { prisma } from "@/lib/db";
import { BUILDINGS, TURNS, type HousingBuilding } from "@/lib/game-constants";
import { capacityByBuilding, usageByBuilding, type SpaceByBuilding } from "@/lib/housing";
import { syncTurns } from "@/server/game-engine/turns";
import { enforceHousing, syncOverflowDeadlines } from "@/server/services/housing.service";
import type { BuildingType } from "@prisma/client";

export type BuildResult =
  | { ok: true }
  | { ok: false; error: string; status: 400 | 403 | 404 };

/** Thrown inside the transaction to roll it back with a player-facing message. */
class BuildRejected extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404) { super(message); }
}

export interface BuildingsOverview {
  money:     number;
  /** Free land (Resource.land) — what construction consumes. */
  land:      number;
  turns:     number;
  counts:    Partial<Record<BuildingType, number>>;
  capacity:  SpaceByBuilding;
  usage:     SpaceByBuilding;
  /** Open overflow deadlines, ISO strings. */
  deadlines: Partial<Record<HousingBuilding, string>>;
}

/**
 * Everything the buildings and arsenal pages need. Applies any expired desertion
 * first (lazy evaluation), so what the player sees is current.
 */
export async function getBuildingsOverview(playerId: string): Promise<BuildingsOverview | null> {
  const nation = await prisma.nation.findUnique({ where: { playerId }, select: { id: true } });
  if (!nation) return null;
  await syncTurns(nation.id);

  return prisma.$transaction(async (tx) => {
    const open = await enforceHousing(tx, nation.id);
    const [n, buildings, units] = await Promise.all([
      tx.nation.findUniqueOrThrow({
        where:  { id: nation.id },
        select: { turns: true, resource: { select: { money: true, land: true } } },
      }),
      tx.building.findMany({ where: { nationId: nation.id }, select: { type: true, count: true } }),
      tx.unit.findMany({
        where:  { army: { nationId: nation.id }, quantity: { gt: 0 } },
        select: { quantity: true, unitType: { select: { slug: true } } },
      }),
    ]);

    const deadlines: Partial<Record<HousingBuilding, string>> = {};
    for (const [type, d] of Object.entries(open) as Array<[HousingBuilding, Date]>) deadlines[type] = d.toISOString();

    return {
      money:     n.resource?.money ?? 0,
      land:      n.resource?.land  ?? 0,
      turns:     n.turns,
      counts:    Object.fromEntries(buildings.map((b) => [b.type, b.count])),
      capacity:  capacityByBuilding(buildings),
      usage:     usageByBuilding(units.map((u) => ({ slug: u.unitType.slug, quantity: u.quantity }))),
      deadlines,
    };
  }, { timeout: 15_000 });
}

export async function buildBuildings(playerId: string, type: BuildingType, count: number): Promise<BuildResult> {
  const nation = await prisma.nation.findUnique({
    where:  { playerId },
    select: { id: true, status: true },
  });
  if (!nation) return { ok: false, error: "No enclave", status: 404 };
  if (nation.status === "DESTROYED") return { ok: false, error: "Enclave destroyed", status: 403 };

  await syncTurns(nation.id);

  const moneyCost = BUILDINGS.MONEY_COST[type] * count;
  const landCost  = BUILDINGS.LAND_PER_BUILDING * count;
  const turnCost  = TURNS.BUILD_COST * count;

  try {
    await prisma.$transaction(async (tx) => {
      await enforceHousing(tx, nation.id);

      const spentTurns = await tx.nation.updateMany({
        where: { id: nation.id, turns: { gte: turnCost } },
        data:  { turns: { decrement: turnCost } },
      });
      if (spentTurns.count === 0) throw new BuildRejected(`Not enough turns (need ${turnCost})`, 400);

      const paid = await tx.resource.updateMany({
        where: { nationId: nation.id, money: { gte: moneyCost }, land: { gte: landCost } },
        data:  { money: { decrement: moneyCost }, land: { decrement: landCost } },
      });
      if (paid.count === 0) {
        const res = await tx.resource.findUnique({ where: { nationId: nation.id }, select: { money: true } });
        throw new BuildRejected(
          (res?.money ?? 0) < moneyCost
            ? `Need ${moneyCost.toLocaleString()} money`
            : `Need ${landCost} free land`,
          400,
        );
      }

      await tx.building.upsert({
        where:  { nationId_type: { nationId: nation.id, type } },
        update: { count: { increment: count } },
        create: { nationId: nation.id, type, count },
      });

      // More room may clear an open overflow deadline
      await syncOverflowDeadlines(tx, nation.id);
    }, { timeout: 15_000 });
  } catch (err) {
    if (err instanceof BuildRejected) return { ok: false, error: err.message, status: err.status };
    throw err;
  }

  return { ok: true };
}
