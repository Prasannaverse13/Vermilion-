/**
 * Vermilion — Lifecycle primitives (advanced autonomy)
 * ----------------------------------------------------
 * What we add on top of runAutonomousCycle to look like a real
 * autonomous agent (not just a cron-triggered LLM):
 *
 *   • Activity log     — every autonomous action written to
 *                        `agent_activity`. The /app/activity page
 *                        reads this in reverse-chronological order.
 *   • Morning brief    — at 9:35 ET, the agent writes a self-prompt
 *                        that previews the day's plan: "I'm watching
 *                        X because Y; I'll skip Z because W."
 *   • Reflection       — at 16:10 ET, the agent audits its own day's
 *                        decisions and writes a `agent_reflections`
 *                        row citing specific wins/misses.
 *   • Plans            — long-running theses. The agent opens,
 *                        updates progress, and closes plans.
 *   • North-star       — periodic snapshots of the constitution's
 *                        metrics so the dashboard can show trends.
 *   • Tool-use log     — every tool call from the LLM is recorded
 *                        against the decision that triggered it.
 *
 * This module is best-effort: every function catches its own errors
 * and returns a `posted: false` rather than throwing, because the
 * agent must keep running even if the audit trail is partially
 * broken.
 */

import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { CONSTITUTION } from "./constitution";

// ---- Activity log ---------------------------------------------------------

export type ActivityKind =
  | "wake-on-visit"
  | "cron-cycle"
  | "manual-cycle"
  | "self-recovery"
  | "self-prompt"
  | "morning-brief"
  | "reflection"
  | "plan-opened"
  | "plan-updated"
  | "plan-closed"
  | "snapshot-failed"
  | "order-placed"
  | "order-failed"
  | "threshold-tightened"
  | "threshold-loosened"
  | "watchlist-expanded"
  | "watchlist-pruned";

/**
 * Append a row to agent_activity. Returns false on any failure —
 * never throws. The agent's runtime is more important than its
 * audit trail.
 */
export async function logActivity(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string,
  entry: {
    kind: ActivityKind;
    title: string;
    detail?: string;
    symbols?: string[];
    meta?: Record<string, unknown>;
  },
): Promise<boolean> {
  try {
    const { error } = await supabase.from("agent_activity").insert({
      user_id: userId,
      kind: entry.kind,
      title: entry.title,
      detail: entry.detail ?? null,
      symbols: entry.symbols ?? [],
      meta: entry.meta ?? null,
    });
    if (error) return false;
    return true;
  } catch {
    return false;
  }
}

// ---- Self-prompt: advanced variants ---------------------------------------

/**
 * Write a message into the "Vermilion · self-notes" chat session
 * with custom content. Used by morning brief, reflection, and
 * plan updates.
 */
export async function postAgentNote(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string,
  content: string,
  meta: Record<string, unknown>,
): Promise<{ posted: boolean; sessionId?: string; reason?: string }> {
  try {
    const { data: existing } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("user_id", userId)
      .eq("title", "Vermilion · self-notes")
      .limit(1);

    let sessionId = existing?.[0]?.id;
    if (!sessionId) {
      const { data: created, error: cErr } = await supabase
        .from("chat_sessions")
        .insert({ user_id: userId, title: "Vermilion · self-notes" })
        .select("id")
        .single();
      if (cErr || !created) {
        return { posted: false, reason: cErr?.message ?? "create_session_failed" };
      }
      sessionId = created.id;
    }

    const { error: mErr } = await supabase.from("chat_messages").insert({
      session_id: sessionId,
      user_id: userId,
      role: "assistant",
      content,
      meta,
    });
    if (mErr) return { posted: false, sessionId, reason: mErr.message };
    return { posted: true, sessionId };
  } catch (e) {
    return { posted: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

// ---- Morning brief --------------------------------------------------------

export type MorningBriefInput = {
  /** Recent refusals on the watchlist — what we've already said no to. */
  recentRefusals: { symbol: string; reasoning: string; created_at: string }[];
  /** Open positions. */
  positions: { symbol: string; qty: number; pnl: number; pnlPct: number }[];
  /** Today's news headlines, if any. */
  news: { symbol: string; headline: string }[];
  /** Open plans the agent is currently running. */
  openPlans: { title: string; thesis: string; symbols: string[] }[];
};

/**
 * Compose a morning brief in the agent's voice. Pure function — no
 * LLM call. Cheap, deterministic, runs at 9:35 ET every market day.
 */
export async function postMorningBrief(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string,
  input: MorningBriefInput,
): Promise<{ posted: boolean; reason?: string }> {
  try {
    const lines: string[] = [];
    const today = new Date().toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    lines.push(`Morning brief — ${today}`);
    lines.push("");

    if (input.positions.length) {
      lines.push("Holding:");
      for (const p of input.positions) {
        const sign = p.pnl >= 0 ? "+" : "";
        lines.push(`- ${p.symbol}: ${p.qty} sh, unrealized ${sign}$${p.pnl.toFixed(2)} (${sign}${p.pnlPct.toFixed(2)}%)`);
      }
      lines.push("");
    } else {
      lines.push("No open positions. I'll be looking for fresh entries.");
      lines.push("");
    }

    if (input.openPlans.length) {
      lines.push("Active theses:");
      for (const p of input.openPlans) {
        const syms = p.symbols.length ? ` (${p.symbols.join(", ")})` : "";
        lines.push(`- ${p.title}${syms}`);
      }
      lines.push("");
    }

    if (input.news.length) {
      lines.push("News on the radar:");
      for (const n of input.news.slice(0, 5)) {
        lines.push(`- ${n.symbol}: ${n.headline}`);
      }
      lines.push("");
    }

    if (input.recentRefusals.length) {
      lines.push("Continuing to refuse (no fresh edge):");
      for (const r of input.recentRefusals.slice(0, 3)) {
        lines.push(`- ${r.symbol}: ${r.reasoning.split(".")[0]}.`);
      }
    }

    const content = lines.join("\n");
    const r = await postAgentNote(supabase, userId, content, {
      trigger: "morning-brief",
      date: new Date().toISOString().slice(0, 10),
    });
    await logActivity(supabase, userId, {
      kind: "morning-brief",
      title: "Morning brief posted",
      detail: content.slice(0, 240),
      meta: { messageCount: input.news.length, positionCount: input.positions.length },
    });
    return r;
  } catch (e) {
    return { posted: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

// ---- Reflection -----------------------------------------------------------

export type ReflectionInput = {
  decisions: {
    symbol: string;
    action: string;
    refused: boolean;
    confidence: number;
    fill_price?: number;
    reasoning: string;
  }[];
  positions: { symbol: string; qty: number; entry_price: number; current_price: number }[];
};

/**
 * End-of-day reflection. Computes wins/misses in plain TypeScript
 * (no LLM call), then writes a `agent_reflections` row. Designed
 * to run at 16:10 ET on weekdays.
 */
export async function postReflection(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string,
  input: ReflectionInput,
): Promise<{ posted: boolean; reason?: string }> {
  try {
    const total = input.decisions.length;
    const refused = input.decisions.filter((d) => d.refused).length;
    const executed = total - refused;
    // The session_date is the ET date of the latest decision in the
    // window — so the reflection always lands on the date of the
    // trading day it covers, not "today" (which can be a different
    // day in UTC vs ET).
    const sessionDate =
      input.decisions.length > 0
        ? new Date(
            Math.max(
              ...input.decisions.map((d) =>
                new Date((d as { created_at?: string }).created_at ?? Date.now()).getTime(),
              ),
            ),
          )
            .toLocaleDateString("en-CA", { timeZone: "America/New_York" })
        : new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

    // Identify executed trades and their unrealized P&L right now.
    const posBySym = new Map(input.positions.map((p) => [p.symbol, p]));
    const trades = input.decisions.filter((d) => !d.refused);
    const wins = [];
    const misses = [];
    for (const t of trades) {
      const pos = posBySym.get(t.symbol);
      if (!pos) {
        // Already closed. We don't track closed P&L precisely here.
        continue;
      }
      const pnl = (pos.current_price - (t.fill_price ?? pos.entry_price)) * pos.qty;
      const item = {
        symbol: t.symbol,
        action: t.action,
        pnl,
        lesson:
          pnl >= 0
            ? `${t.action} at $${t.fill_price?.toFixed(2) ?? "—"} worked; current unrealized +$${pnl.toFixed(2)}`
            : `${t.action} at $${t.fill_price?.toFixed(2) ?? "—"} is underwater at $${pos.current_price.toFixed(2)}`,
      };
      if (pnl >= 0) wins.push(item);
      else misses.push(item);
    }

    // Compose the free-form reflection.
    const lines: string[] = [];
    lines.push(
      `Session closed. ${refused}/${total} symbols refused, ${executed} executed.`,
    );
    if (wins.length) {
      lines.push("");
      lines.push("Wins:");
      for (const w of wins) lines.push(`- ${w.symbol}: ${w.lesson}`);
    }
    if (misses.length) {
      lines.push("");
      lines.push("Misses:");
      for (const m of misses) lines.push(`- ${m.symbol}: ${m.lesson}`);
    }
    if (refused === total) {
      lines.push("");
      lines.push(
        "Refused everything. That's discipline, but I'll be sharper tomorrow — if the same names move without me, I need to understand why my thesis was wrong.",
      );
    } else if (wins.length === 0 && misses.length === 0) {
      lines.push("");
      lines.push(
        "All decisions are still open. Tomorrow's P&L will tell us if the day was good.",
      );
    }
    const text = lines.join("\n");

    // Upsert (one reflection per day per user).
    await supabase.from("agent_reflections").upsert(
      {
        user_id: userId,
        session_date: sessionDate,
        total_decisions: total,
        total_refused: refused,
        total_executed: executed,
        wins,
        misses,
        text,
        meta: { constitution_clauses: CONSTITUTION.length },
      },
      { onConflict: "user_id,session_date" },
    );

    // Post the reflection as a chat note too.
    await postAgentNote(supabase, userId, text, {
      trigger: "reflection",
      date: sessionDate,
      wins: wins.length,
      misses: misses.length,
    });

    await logActivity(supabase, userId, {
      kind: "reflection",
      title: `Reflection: ${refused}/${total} refused`,
      detail: text.slice(0, 240),
      meta: { wins: wins.length, misses: misses.length, total },
    });
    return { posted: true };
  } catch (e) {
    return { posted: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

// ---- Plans ----------------------------------------------------------------

/**
 * Open a new plan. Returns the new plan id, or null on failure.
 */
export async function openPlan(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string,
  plan: {
    title: string;
    thesis: string;
    symbols?: string[];
  },
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("agent_plans")
      .insert({
        user_id: userId,
        title: plan.title,
        thesis: plan.thesis,
        symbols: plan.symbols ?? [],
        status: "open",
      })
      .select("id")
      .single();
    if (error || !data) return null;
    await logActivity(supabase, userId, {
      kind: "plan-opened",
      title: `Plan opened: ${plan.title}`,
      detail: plan.thesis,
      symbols: plan.symbols,
    });
    return data.id;
  } catch {
    return null;
  }
}

export async function updatePlan(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string,
  planId: string,
  update: {
    status?: "open" | "progressing" | "closed" | "abandoned";
    progress?: number;
    outcome?: string;
  },
): Promise<boolean> {
  try {
    const patch: Record<string, unknown> = {};
    if (update.status) patch.status = update.status;
    if (update.progress != null) patch.progress = update.progress;
    if (update.outcome) patch.outcome = update.outcome;
    if (update.status === "closed" || update.status === "abandoned") {
      patch.closed_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from("agent_plans")
      .update(patch)
      .eq("id", planId)
      .eq("user_id", userId);
    if (error) return false;
    if (update.status === "closed" || update.status === "abandoned") {
      await logActivity(supabase, userId, {
        kind: "plan-closed",
        title: `Plan ${update.status}: ${planId.slice(0, 8)}`,
        detail: update.outcome,
      });
    } else {
      await logActivity(supabase, userId, {
        kind: "plan-updated",
        title: `Plan progress: ${update.progress ?? "?"}%`,
        detail: planId,
      });
    }
    return true;
  } catch {
    return false;
  }
}

// ---- North-star metrics ---------------------------------------------------

/**
 * Capture a snapshot of the agent's north-star metrics. Cheap
 * computation, runs at the end of every cycle and once at the
 * start of the day.
 */
export async function captureNorthStars(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string,
  input: {
    decisionsLast7d: { action: string; refused: boolean; confidence: number }[];
    positions: { qty: number; current_price: number; entry_price: number; symbol: string }[];
  },
): Promise<void> {
  try {
    const total = input.decisionsLast7d.length;
    const refused = input.decisionsLast7d.filter((d) => d.refused).length;
    const executed = input.decisionsLast7d.filter((d) => !d.refused);
    const overThreshold = executed.filter((d) => d.confidence >= 60).length;
    const totalPnl = input.positions.reduce(
      (s, p) => s + (p.current_price - p.entry_price) * p.qty,
      0,
    );

    const metrics: { metric: string; current: number; target: string; trend: string }[] = [
      {
        metric: "refusal-rate",
        current: total ? Math.round((refused / total) * 100) : 0,
        target: "≥ 70%",
        trend: "flat",
      },
      {
        metric: "edge-rate",
        current: executed.length
          ? Math.round((overThreshold / executed.length) * 100)
          : 0,
        target: "≥ 40%",
        trend: "flat",
      },
      {
        metric: "unrealized-pl",
        current: Number(totalPnl.toFixed(2)),
        target: "> $0",
        trend: totalPnl >= 0 ? "up" : "down",
      },
      {
        metric: "open-positions",
        current: input.positions.length,
        target: "≤ 8",
        trend: "flat",
      },
    ];

    if (metrics.length) {
      await supabase.from("agent_goals").insert(
        metrics.map((m) => ({
          user_id: userId,
          metric: m.metric,
          current: m.current,
          target: m.target,
          trend: m.trend,
          spark: null,
        })),
      );
    }
  } catch {
    /* swallow */
  }
}
