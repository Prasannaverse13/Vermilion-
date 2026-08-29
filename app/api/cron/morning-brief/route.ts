import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { postMorningBrief } from "@/lib/agent/lifecycle";
import { getAccountSummary, getPositions, isMarketOpen } from "@/lib/alpaca/server";

/**
 * POST /api/cron/morning-brief
 *
 * Runs at 9:35 ET Mon–Fri. Composes a morning brief per user and
 * posts it to the Vermilion · self-notes chat session. Authenticated
 * with the CRON_SECRET bearer token.
 *
 * ?user=<uuid>   — single user
 * (no param)     — all users with active sessions
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
  const url = new URL(req.url);
  const userId = url.searchParams.get("user");

  let users: { id: string }[] = [];
  if (userId) {
    users = [{ id: userId }];
  } else {
    const { data } = await service.from("profiles").select("id").limit(50);
    users = (data ?? []) as { id: string }[];
  }

  const marketOpen = await isMarketOpen().catch(() => false);
  const summary = await getAccountSummary().catch(() => null);
  const positionsRaw = summary ? await getPositions().catch(() => []) : [];
  const positions = positionsRaw.map((p) => {
    const cur = Number(p.current_price);
    const entry = Number(p.avg_entry_price);
    const qty = Number(p.qty);
    const pnl = (cur - entry) * qty;
    const pnlPct = entry ? ((cur - entry) / entry) * 100 : 0;
    return { symbol: p.symbol, qty, pnl, pnlPct };
  });

  // Recent refusals (last 24h)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let news: { symbol: string; headline: string }[] = [];
  try {
    const { getNews } = await import("@/lib/alpaca/server");
    const { news: items } = await getNews(["NVDA", "AAPL", "TSLA", "AMD", "META", "MSFT"], 5);
    news = items.slice(0, 5).map((n) => ({ symbol: n.symbols?.[0] ?? "—", headline: n.headline }));
  } catch {
    /* ignore */
  }

  const results: { userId: string; posted: boolean; reason?: string; cycleEvaluated: number }[] = [];

  // Run a quick cycle per user first so the morning brief is grounded
  // in fresh data. We use a 5-symbol watchlist slice to keep the
  // cron fast (the cron budget is 30s on Hobby tier).
  const { runAutonomousCycle } = await import("@/lib/agent/autonomy");
  let cycleEvaluated = 0;
  for (const u of users) {
    try {
      const cycle = await runAutonomousCycle({
        userId: u.id,
        triggeredBy: "cron",
        symbolsOverride: ["NVDA", "AAPL", "TSLA", "AMD", "META"],
      });
      cycleEvaluated = cycle.evaluated;
      console.log(`[morning-brief] cycle for ${u.id.slice(0, 8)}: ${cycle.evaluated} evaluated, ${cycle.executed} executed, ${cycle.refused} refused`);
    } catch (e) {
      console.error(`[morning-brief] cycle error:`, e instanceof Error ? e.message : e);
    }
    // Then compose the brief
    const { data: refusals } = await service
      .from("decisions")
      .select("symbol, reasoning, created_at")
      .eq("user_id", u.id)
      .eq("refused", true)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5);
    const { data: plans } = await service
      .from("agent_plans")
      .select("title, thesis, symbols")
      .eq("user_id", u.id)
      .in("status", ["open", "progressing"])
      .limit(5);

    const r = await postMorningBrief(service, u.id, {
      recentRefusals: (refusals ?? []) as { symbol: string; reasoning: string; created_at: string }[],
      positions,
      news,
      openPlans: (plans ?? []) as { title: string; thesis: string; symbols: string[] }[],
    });
    results.push({ userId: u.id, posted: r.posted, reason: r.reason, cycleEvaluated });
  }

  return NextResponse.json({
    ok: true,
    marketOpen,
    usersProcessed: results.length,
    results,
  });
}

export const GET = POST;
