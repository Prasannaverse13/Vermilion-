/**
 * Vermilion — Pending-decision queue
 * ----------------------------------
 * When the agent wants to trade but the user has not (yet) signed off,
 * the decision is parked in `pending_decisions` instead of being
 * placed directly. The user can then approve, decline, or comment
 * via the in-app queue page, Telegram/WhatsApp/Apple reply buttons,
 * email links, or the chat.
 *
 * Three autonomy levels control the lifecycle:
 *   - "manual"     — every decision waits forever until the user acts.
 *   - "suggest"    — wait, but the queue UI is the primary surface.
 *   - "autonomous" — wait, but auto-execute after `auto_approve_delay_s`
 *                     unless the user vetoes.
 *
 * A cron sweep runs at every cycle / morning-brief / reflection to
 * expire-or-execute decisions whose grace period has elapsed.
 */

import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { placeOrder, getSnapshot } from "@/lib/alpaca/server";
import { logActivity } from "./lifecycle";
import { notify } from "../notifications";

export type PendingDecision = {
  id: string;
  user_id: string;
  decision_id: string | null;
  symbol: string;
  action: "buy" | "sell" | "short" | "cover";
  qty: number;
  est_price: number | null;
  confidence: number;
  threshold: number;
  reasoning: string;
  sources: { tag: string; text: string }[] | null;
  status: "pending" | "approved" | "declined" | "expired" | "executed" | "failed";
  user_comment: string | null;
  approved_at: string | null;
  declined_at: string | null;
  expired_at: string | null;
  executed_at: string | null;
  order_id: string | null;
  fill_price: number | null;
  error: string | null;
  resolve_token: string;
  expires_at: string;
  created_at: string;
};

export type UserGoalSettings = {
  autonomy_level: "autonomous" | "suggest" | "manual";
  auto_approve_delay_s: number;
  confidence_threshold: number;
};

/**
 * Fetch the user's goal settings, creating a default row if missing.
 */
export async function getUserGoalSettings(
  userId: string,
): Promise<UserGoalSettings> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("user_goals")
    .select("autonomy_level, auto_approve_delay_s, confidence_threshold")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    autonomy_level: (data?.autonomy_level as UserGoalSettings["autonomy_level"]) ?? "suggest",
    auto_approve_delay_s: data?.auto_approve_delay_s ?? 300,
    confidence_threshold: data?.confidence_threshold != null
      ? Number(data.confidence_threshold)
      : 60,
  };
}

/**
 * Create a pending decision. Returns the new row, or null on
 * failure. The caller is responsible for checking the user's
 * autonomy_level and acting on `expires_at` accordingly.
 */
export async function createPendingDecision(
  userId: string,
  decision: {
    decision_id?: string;
    symbol: string;
    action: "buy" | "sell" | "short" | "cover";
    qty: number;
    est_price: number | null;
    confidence: number;
    threshold: number;
    reasoning: string;
    sources: { tag: string; text: string }[];
    delaySeconds: number;
  },
): Promise<PendingDecision | null> {
  const supabase = await createServerSupabase();
  const expiresAt = new Date(Date.now() + decision.delaySeconds * 1000).toISOString();
  const { data, error } = await supabase
    .from("pending_decisions")
    .insert({
      user_id: userId,
      decision_id: decision.decision_id ?? null,
      symbol: decision.symbol,
      action: decision.action,
      qty: decision.qty,
      est_price: decision.est_price,
      confidence: decision.confidence,
      threshold: decision.threshold,
      reasoning: decision.reasoning,
      sources: decision.sources,
      status: "pending",
      expires_at: expiresAt,
    })
    .select()
    .single();
  if (error || !data) return null;

  // Log + notify
  await logActivity(supabase, userId, {
    kind: "order-placed",
    title: `Pending review: ${decision.action.toUpperCase()} ${decision.qty} ${decision.symbol}`,
    detail: `Confidence ${decision.confidence.toFixed(0)}% (threshold ${decision.threshold.toFixed(0)}%). Awaiting user sign-off in ${decision.delaySeconds}s.`,
    symbols: [decision.symbol],
    meta: { pending_id: data.id, resolve_token: data.resolve_token },
  });

  // Send notifications
  await notify(userId, {
    userId,
    kind: "pending_decision",
    subject: `Vermilion: ${decision.action.toUpperCase()} ${decision.symbol}`,
    body: `${decision.qty} ${decision.symbol} @ ~$${(decision.est_price ?? 0).toFixed(2)} (confidence ${decision.confidence.toFixed(0)}%).\n\n${decision.reasoning}`,
    pendingDecisionId: data.id,
    resolveToken: data.resolve_token,
  });

  return data as PendingDecision;
}

/**
 * Resolve a pending decision. Called by all four webhooks
 * (Telegram, WhatsApp, Apple, Resend) and the in-app queue page.
 *
 * `action`:
 *   - "approve"  — mark approved, immediately place the order,
 *                  update row to "executed" (or "failed").
 *   - "decline"  — mark declined, no order placed.
 *   - "comment"  — record the comment, leave the decision pending.
 */
export async function resolvePendingDecision(
  userId: string,
  pendingId: string,
  action: "approve" | "decline" | "comment",
  opts: { comment?: string; resolveToken?: string } = {},
): Promise<{ ok: boolean; reason?: string; status?: PendingDecision["status"] }> {
  const supabase = await createServerSupabase();

  // Fetch the pending decision
  const { data: row, error: rErr } = await supabase
    .from("pending_decisions")
    .select("*")
    .eq("id", pendingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (rErr || !row) return { ok: false, reason: "not_found" };
  const pd = row as PendingDecision;
  if (pd.status !== "pending") {
    return { ok: false, reason: `already_${pd.status}`, status: pd.status };
  }

  if (action === "comment") {
    await supabase
      .from("pending_decisions")
      .update({ user_comment: opts.comment ?? "" })
      .eq("id", pendingId);
    await logActivity(supabase, userId, {
      kind: "plan-updated",
      title: `Comment on ${pd.symbol}: ${(opts.comment ?? "").slice(0, 80)}`,
      detail: opts.comment,
      symbols: [pd.symbol],
    });
    return { ok: true, status: "pending" };
  }

  if (action === "decline") {
    await supabase
      .from("pending_decisions")
      .update({
        status: "declined",
        declined_at: new Date().toISOString(),
        user_comment: opts.comment ?? null,
      })
      .eq("id", pendingId);
    await logActivity(supabase, userId, {
      kind: "order-failed",
      title: `Declined: ${pd.action.toUpperCase()} ${pd.qty} ${pd.symbol}`,
      detail: opts.comment ?? "User declined via queue.",
      symbols: [pd.symbol],
      meta: { pending_id: pendingId, reason: "user_declined" },
    });
    return { ok: true, status: "declined" };
  }

  // approve
  await supabase
    .from("pending_decisions")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", pendingId);

  // Place the order
  try {
    const order = await placeOrder({
      symbol: pd.symbol,
      qty: pd.qty,
      side: pd.action === "short" || pd.action === "sell" ? "sell" : "buy",
    });
    await supabase
      .from("pending_decisions")
      .update({
        status: "executed",
        executed_at: new Date().toISOString(),
        order_id: order.id,
        fill_price: order.filled_avg_price
          ? Number(order.filled_avg_price)
          : order.filled_qty && pd.est_price
            ? Number(pd.est_price)
            : null,
      })
      .eq("id", pendingId);
    await logActivity(supabase, userId, {
      kind: "order-placed",
      title: `Executed: ${pd.action.toUpperCase()} ${pd.qty} ${pd.symbol} @ $${order.filled_avg_price ?? "?"}`,
      detail: `Approved by user, filled via Alpaca paper account. Order ${order.id}.`,
      symbols: [pd.symbol],
      meta: { pending_id: pendingId, order_id: order.id },
    });
    return { ok: true, status: "executed" };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await supabase
      .from("pending_decisions")
      .update({
        status: "failed",
        error: err,
        executed_at: new Date().toISOString(),
      })
      .eq("id", pendingId);
    await logActivity(supabase, userId, {
      kind: "order-failed",
      title: `Approved but order failed: ${pd.symbol}`,
      detail: err,
      symbols: [pd.symbol],
      meta: { pending_id: pendingId, error: err },
    });
    return { ok: true, status: "failed", reason: err };
  }
}

/**
 * Sweep expired pending decisions. Called by the cron and at the
 * end of every cycle.
 *
 *   - If `autonomy_level = autonomous`, the order is auto-approved
 *     and placed.
 *   - Otherwise, the decision is marked `expired` and the order is
 *     NOT placed (user missed the window; the cycle is in `manual`
 *     or `suggest` mode).
 */
export async function sweepPendingDecisions(userId: string): Promise<{
  expired: number;
  autoExecuted: number;
}> {
  const supabase = await createServerSupabase();
  const goals = await getUserGoalSettings(userId);
  const now = new Date().toISOString();

  // Find every pending decision that's past its expires_at
  const { data: expired } = await supabase
    .from("pending_decisions")
    .select("id, symbol, action, qty, est_price")
    .eq("user_id", userId)
    .eq("status", "pending")
    .lt("expires_at", now);
  const rows = (expired ?? []) as { id: string; symbol: string; action: "buy" | "sell" | "short" | "cover"; qty: number; est_price: number | null }[];

  let autoExecuted = 0;
  for (const r of rows) {
    if (goals.autonomy_level === "autonomous") {
      // Auto-approve and place
      const res = await resolvePendingDecision(userId, r.id, "approve", {
        comment: "Auto-approved: grace period elapsed in autonomous mode.",
      });
      if (res.ok && (res.status === "executed" || res.status === "failed")) {
        autoExecuted++;
      }
    } else {
      // Mark expired without executing
      await supabase
        .from("pending_decisions")
        .update({
          status: "expired",
          expired_at: now,
        })
        .eq("id", r.id);
      await logActivity(supabase, userId, {
        kind: "order-failed",
        title: `Expired: ${r.action.toUpperCase()} ${r.qty} ${r.symbol}`,
        detail: `Decision expired (autonomy=${goals.autonomy_level}). User did not act in time.`,
        symbols: [r.symbol],
        meta: { pending_id: r.id, reason: "expired" },
      });
    }
  }
  return { expired: rows.length, autoExecuted };
}
