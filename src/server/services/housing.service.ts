// Army housing — overflow deadlines, desertion and the training guard.
// Everything is evaluated lazily inside the caller's transaction (no timers):
// call enforceHousing before reading an army that matters (tick, train, battle).
import { HOUSING, type HousingBuilding } from "@/lib/game-constants";
import {
  HOUSING_BUILDINGS, HOUSING_LABEL, capacityByBuilding, housingFor, overflowByBuilding,
  planDesertion, usageByBuilding, type SpaceByBuilding,
} from "@/lib/housing";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

interface HousingState {
  buildings: Array<{ id: string; type: string; count: number; overflowDeadline: Date | null }>;
  stacks:    Array<{ id: string; quantity: number; slug: string; name: string }>;
  capacity:  SpaceByBuilding;
  usage:     SpaceByBuilding;
  overflow:  SpaceByBuilding;
}

async function loadHousing(tx: Tx, nationId: string): Promise<HousingState> {
  const [buildings, units] = await Promise.all([
    tx.building.findMany({
      where:  { nationId },
      select: { id: true, type: true, count: true, overflowDeadline: true },
    }),
    tx.unit.findMany({
      where:  { army: { nationId }, quantity: { gt: 0 } },
      select: { id: true, quantity: true, unitType: { select: { slug: true, name: true } } },
    }),
  ]);
  const stacks   = units.map((u) => ({ id: u.id, quantity: u.quantity, slug: u.unitType.slug, name: u.unitType.name }));
  const capacity = capacityByBuilding(buildings);
  const usage    = usageByBuilding(stacks);
  return { buildings, stacks, capacity, usage, overflow: overflowByBuilding(capacity, usage) };
}

export type OverflowDeadlines = Partial<Record<HousingBuilding, Date>>;

/**
 * Starts a deadline for every housing type that is over capacity and has none yet
 * (an existing deadline is never moved), and clears deadlines where the army fits
 * again. Notifies the owner when a new deadline starts. Returns all open deadlines.
 */
export async function syncOverflowDeadlines(tx: Tx, nationId: string, now = new Date()): Promise<OverflowDeadlines> {
  const state    = await loadHousing(tx, nationId);
  const open: OverflowDeadlines = {};
  const started: Array<{ building: HousingBuilding; deadline: Date; excessSpace: number }> = [];

  for (const type of HOUSING_BUILDINGS) {
    const row  = state.buildings.find((b) => b.type === type);
    const over = state.overflow[type];

    if (over > 0) {
      if (row?.overflowDeadline) { open[type] = row.overflowDeadline; continue; }
      const deadline = new Date(now.getTime() + HOUSING.OVERFLOW_GRACE_HOURS * 3_600_000);
      await tx.building.upsert({
        where:  { nationId_type: { nationId, type } },
        update: { overflowDeadline: deadline },
        create: { nationId, type, count: 0, overflowDeadline: deadline },
      });
      open[type] = deadline;
      started.push({ building: type, deadline, excessSpace: over });
    } else if (row?.overflowDeadline) {
      await tx.building.update({ where: { id: row.id }, data: { overflowDeadline: null } });
    }
  }

  if (started.length > 0) {
    await tx.notification.create({
      data: {
        nationId,
        type:    "GARRISON_OVERFLOW",
        payload: {
          message: started
            .map((s) => `${HOUSING_LABEL[s.building]} over capacity by ${s.excessSpace} space`)
            .join("; ") + `. Build more within ${HOUSING.OVERFLOW_GRACE_HOURS}h or the excess units desert.`,
          overflows: started.map((s) => ({
            building:    s.building,
            label:       HOUSING_LABEL[s.building],
            excessSpace: s.excessSpace,
            deadline:    s.deadline.toISOString(),
          })),
        },
      },
    });
  }
  return open;
}

/**
 * Applies desertion for every housing type whose deadline has passed while still
 * over capacity: only the excess leaves, spread over that building's unit types.
 * Re-syncs Nation.totalUnits, notifies the owner, then re-syncs deadlines.
 */
export async function enforceHousing(tx: Tx, nationId: string, now = new Date()): Promise<OverflowDeadlines> {
  const state = await loadHousing(tx, nationId);
  const expired = HOUSING_BUILDINGS.filter((type) => {
    const deadline = state.buildings.find((b) => b.type === type)?.overflowDeadline;
    return deadline && deadline <= now && state.overflow[type] > 0;
  });

  if (expired.length > 0) {
    const deserted: Array<{ building: HousingBuilding; unit: string; quantity: number }> = [];
    let removed = 0;

    for (const type of expired) {
      const stacks = state.stacks
        .map((s) => ({ ...s, ...housingFor(s.slug) }))
        .filter((s) => s.building === type);
      const plan = planDesertion(stacks, state.overflow[type]);
      for (const [id, n] of plan) {
        await tx.unit.update({ where: { id }, data: { quantity: { decrement: n } } });
        const stack = stacks.find((s) => s.id === id);
        deserted.push({ building: type, unit: stack?.name ?? "Unit", quantity: n });
        removed += n;
      }
    }

    if (removed > 0) {
      const remaining = state.stacks.reduce((s, u) => s + u.quantity, 0) - removed;
      await tx.nation.update({ where: { id: nationId }, data: { totalUnits: remaining } });
      await tx.notification.create({
        data: {
          nationId,
          type:    "UNITS_DESERTED",
          payload: {
            message: `Units left for lack of housing: ${deserted.map((d) => `${d.quantity}× ${d.unit}`).join(", ")}`,
            deserted,
          },
        },
      });
    }
  }

  return syncOverflowDeadlines(tx, nationId, now);
}

/**
 * Training guard: returns an error message when `quantity` more units of `slug`
 * would not fit in their housing, or null when they do.
 */
export async function checkCanHouse(tx: Tx, nationId: string, slug: string, quantity: number): Promise<string | null> {
  const state = await loadHousing(tx, nationId);
  const h     = housingFor(slug);
  const label = HOUSING_LABEL[h.building];

  if (state.overflow[h.building] > 0) {
    return `Your ${label} space is over capacity. Build more ${label} before training these units`;
  }
  const needed = quantity * h.space;
  const free   = state.capacity[h.building] - state.usage[h.building];
  if (needed > free) {
    return `Not enough ${label} space: need ${needed}, have ${free} free (each ${label} houses ${HOUSING.CAPACITY[h.building]})`;
  }
  return null;
}
