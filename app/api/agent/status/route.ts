import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isMarketOpen } from "@/lib/alpaca/server";
import { STALE_AFTER_MS } from "@/lib/agent/autonomy";

/**
 * GET /api/agent/status
 *
 * Cheap, no-side-effect probe that the AutonomyStatus panel polls
 * every 60s. Returns:
 *   - lastDecisionAt: ISO string | null
 *   - ageMs: number | null
 *   - stale: true if the cycle is overdue
 *   - marketOpen: true if the equity market is open
 *   - nextPlannedMs: rough ETA to the next cron tick (best-effort)
 */

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [last, marketOpen] = await Promise.all([
    supabase
      .from("decisions")
      .select("created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    isMarketOpen().catch(() => false),
  ]);

  const lastDecisionAt = last.data?.created_at ?? null;
  const ageMs = lastDecisionAt
    ? Date.now() - new Date(lastDecisionAt).getTime()
    : null;
  const stale = ageMs == null || ageMs > STALE_AFTER_MS;

  // Best-effort ETA to the next planned wake (cron every 15 min,
  // market hours only). We don't pull Vercel's actual schedule —
  // we just estimate from now + 15 min.
  const nextPlannedMs = marketOpen ? Math.max(0, 15 * 60_000 - (ageMs ?? 0)) : null;

  return NextResponse.json({
    lastDecisionAt,
    ageMs,
    stale,
    marketOpen,
    nextPlannedMs,
    staleAfterMs: STALE_AFTER_MS,
  });
}
