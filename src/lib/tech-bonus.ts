// Research bonuses — pure helpers shared by client and server.
// TechNode.bonusType/bonusValue describe what a completed tech gives.

/** Bonus types the game applies today. Others wait for their systems. */
export const ACTIVE_BONUS_TYPES = ["attack_pct", "defense_pct", "income_pct", "unlock_unit"] as const;

export interface TechBonuses {
  /** Additive fractions, e.g. 0.25 = +25%. */
  attackPct:  number;
  defensePct: number;
  incomePct:  number;
}

export const NO_BONUSES: TechBonuses = { attackPct: 0, defensePct: 0, incomePct: 0 };

/** Sums the bonuses of completed techs (they stack additively). */
export function sumTechBonuses(nodes: Array<{ bonusType: string | null; bonusValue: number | null }>): TechBonuses {
  const b = { ...NO_BONUSES };
  for (const n of nodes) {
    const v = n.bonusValue ?? 0;
    if (n.bonusType === "attack_pct")  b.attackPct  += v;
    if (n.bonusType === "defense_pct") b.defensePct += v;
    if (n.bonusType === "income_pct")  b.incomePct  += v;
  }
  return b;
}

export function isActiveBonus(bonusType: string | null): boolean {
  return bonusType !== null && (ACTIVE_BONUS_TYPES as readonly string[]).includes(bonusType);
}

/** Player-facing text for a tech's bonus, e.g. "+15% income". */
export function describeBonus(bonusType: string | null, bonusValue: number | null): string | null {
  const v   = bonusValue ?? 0;
  const pct = `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`;
  switch (bonusType) {
    case "attack_pct":     return `${pct} attack`;
    case "defense_pct":    return `${pct} defense`;
    case "income_pct":     return `${pct} income`;
    case "market_tax_pct": return `${pct} market sell tax`;
    case "intercept_pct":  return `${pct} missile intercept`;
    case "ci_rating":      return `+${v} counter-intelligence`;
    case "spy_slots":      return `+${v} spy slots`;
    case "unlock_unit":    return "Unlocks new units";
    default:               return null;
  }
}
