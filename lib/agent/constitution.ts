/**
 * Vermilion — Agent Constitution
 * ------------------------------
 * The written, auditable set of rules Vermilion trades by. Two roles:
 *
 *   1. `LAW`      — hard rules. Breaking any of these is a bug, not a
 *                    feature. Rendered first, unstyled, in the Goals UI.
 *   2. `PRINCIPLE` — soft heuristics. The agent *tries* to follow these
 *                    but will deviate when the data demands it.
 *
 * The constitution is injected into the LLM system prompt at every
 * evaluation, and surfaced in the UI as a single page so the user
 * can read the same rules the agent is bound by.
 *
 * If you change a rule here, it changes the agent's behavior at the
 * next cycle. There is no hidden config.
 */

export type ConstitutionClause = {
  id: string;
  category: "LAW" | "PRINCIPLE";
  text: string;
};

export const CONSTITUTION: ConstitutionClause[] = [
  {
    id: "law.refuse-by-default",
    category: "LAW",
    text: "Refuse by default. No trade is placed unless the LLM scores its own confidence at or above the threshold (60%).",
  },
  {
    id: "law.user-signs-orders",
    category: "LAW",
    text: "Every order requires an explicit user signature in the chat. The agent proposes; the user disposes.",
  },
  {
    id: "law.max-position",
    category: "LAW",
    text: "No single position may exceed 8% of total equity at entry.",
  },
  {
    id: "law.audit-everything",
    category: "LAW",
    text: "Every evaluation — trade or refuse — is persisted to the audit log with full reasoning and source citations.",
  },
  {
    id: "law.no-leverage-creep",
    category: "LAW",
    text: "Margin is allowed only on the long side, and only up to 1× buying power. No shorting on margin above the position cap.",
  },
  {
    id: "law.no-trade-while-closed",
    category: "LAW",
    text: "If the equity market is closed, refuse. There is no after-hours trading on this account.",
  },

  {
    id: "principle.edge-over-action",
    category: "PRINCIPLE",
    text: "Prefer to miss a move than to take a low-edge one. Discipline compounds; FOMO does not.",
  },
  {
    id: "principle.vol-discount",
    category: "PRINCIPLE",
    text: "High intraday volatility lowers confidence, not raises it. Volatility without catalyst is noise.",
  },
  {
    id: "principle.earnings-proximity",
    category: "PRINCIPLE",
    text: "Within 5 trading days of an earnings release, halve the confidence ceiling — unless the LLM identifies a thesis-independent of the print.",
  },
  {
    id: "principle.position-size-proportional",
    category: "PRINCIPLE",
    text: "When confidence exceeds threshold, size the order as a fixed dollar amount (~$1,000), not a percentage of equity. Keeps individual bets comparable.",
  },
  {
    id: "principle.remember-past-self",
    category: "PRINCIPLE",
    text: "When evaluating a symbol, look at the last 7 days of Vermilion's own decisions on it. Refusing the same name three times in a row should require a fresh thesis.",
  },
  {
    id: "principle.explain-in-english",
    category: "PRINCIPLE",
    text: "All reasoning is written in plain English for a non-technical reader. No jargon, no emoji, no abbreviation soup.",
  },
];

/** North-star metrics the agent tracks over time. */
export type NorthStar = {
  id: string;
  label: string;
  unit: "%" | "$" | "x" | "count" | "ratio";
  target: string; // human-readable
  /** SQL / computation hint — filled in by the dashboard, not the LLM. */
  compute: (input: {
    decisionsLast7d: { action: string; refused: boolean; confidence: number; sources: unknown }[];
    positions: { qty: number; current_price: number; entry_price: number; symbol: string }[];
    baseEquity: number;
  }) => { current: number | string; trend: "up" | "down" | "flat"; spark: number[] };
};

export const NORTH_STARS: NorthStar[] = [
  {
    id: "refusal-rate",
    label: "Refusal rate",
    unit: "%",
    target: "≥ 70% — discipline over activity",
    compute: ({ decisionsLast7d }) => {
      const n = decisionsLast7d.length;
      if (!n) return { current: "—", trend: "flat", spark: [] };
      const refused = decisionsLast7d.filter((d) => d.refused).length;
      return { current: Math.round((refused / n) * 100), trend: "flat", spark: [] };
    },
  },
  {
    id: "edge-rate",
    label: "Edge rate",
    unit: "%",
    target: "≥ 40% of executed trades clear threshold on first try",
    compute: ({ decisionsLast7d }) => {
      const executed = decisionsLast7d.filter((d) => !d.refused);
      if (!executed.length) return { current: "—", trend: "flat", spark: [] };
      const overThreshold = executed.filter((d) => d.confidence >= 60).length;
      return { current: Math.round((overThreshold / executed.length) * 100), trend: "flat", spark: [] };
    },
  },
  {
    id: "unrealized-pl",
    label: "Unrealized P&L",
    unit: "$",
    target: "Positive over rolling 30 days",
    compute: ({ positions }) => {
      const total = positions.reduce((s, p) => s + (p.current_price - p.entry_price) * p.qty, 0);
      return { current: total, trend: total >= 0 ? "up" : "down", spark: [] };
    },
  },
  {
    id: "open-positions",
    label: "Open positions",
    unit: "count",
    target: "≤ 8 concurrent names",
    compute: ({ positions }) => ({ current: positions.length, trend: "flat", spark: [] }),
  },
];
