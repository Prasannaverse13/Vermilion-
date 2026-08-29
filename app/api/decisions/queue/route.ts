import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sweepPendingDecisions } from "@/lib/agent/queue";

/**
 * GET /api/decisions/queue
 *
 * List the user's pending decisions + the most recent resolved ones.
 * The /app/queue page consumes this.
 *
 * Also opportunistically runs `sweepPendingDecisions` so any
 * expired decisions get marked or auto-executed before the user
 * sees the list.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Sweep first
  const sweep = await sweepPendingDecisions(user.id);

  const { data: rows } = await supabase
    .from("pending_decisions")
    .select("id, decision_id, symbol, action, qty, est_price, confidence, threshold, reasoning, sources, status, user_comment, approved_at, declined_at, expired_at, executed_at, order_id, fill_price, error, resolve_token, expires_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({
    queue: rows ?? [],
    swept: sweep,
  });
}
