import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getSnapshot,
  getBars,
  getAsset,
  getNews,
  getAccountSummary,
  isMarketOpen,
  type Bar,
  type Timeframe,
} from "@/lib/alpaca/server";

/**
 * GET /api/stocks/[symbol]
 * Returns the per-stock detail bundle:
 *   asset, snapshot, intraday bars, recent decisions for this symbol,
 *   and whether the user has it on their watchlist.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ symbol: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { symbol: rawSym } = await ctx.params;
  const symbol = rawSym.trim().toUpperCase();
  if (!/^[A-Z]{1,6}(\.[A-Z])?$/.test(symbol)) {
    return NextResponse.json({ error: "invalid symbol" }, { status: 400 });
  }

  // 1. Asset (cached-ish metadata)
  let asset = null;
  try { asset = await getAsset(symbol); } catch { /* keep null */ }

  // 2. Snapshot (live quote + today bar)
  const snap = await getSnapshot(symbol).catch(() => ({}));

  // 3. Intraday 1-min bars (today) for the chart
  const today = new Date();
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  const startISO = startOfDay.toISOString();
  const endISO = today.toISOString();
  let intradayBars: Bar[] = [];
  try {
    const r = await getBars(symbol, "5Min" as Timeframe, startISO, endISO, 200);
    intradayBars = r.bars ?? [];
  } catch { /* keep empty */ }

  // 4. Past decisions for this symbol
  const { data: decisions } = await supabase
    .from("decisions")
    .select("id, action, refused, confidence, reasoning, sources, qty, price, created_at")
    .eq("user_id", user.id)
    .eq("symbol", symbol)
    .order("created_at", { ascending: false })
    .limit(10);

  // 5. Watchlist membership
  const { data: onWatch } = await supabase
    .from("watchlist")
    .select("source")
    .eq("user_id", user.id)
    .eq("symbol", symbol)
    .maybeSingle();

  // 6. Recent news for this symbol (best effort)
  let news: Awaited<ReturnType<typeof getNews>>["news"] = [];
  try {
    const r = await getNews([symbol], 5);
    news = r.news ?? [];
  } catch { /* keep empty */ }

  // 7. Market open + account (for the "Run evaluation" button)
  const marketOpen = await isMarketOpen();
  let account = null;
  try { account = await getAccountSummary(); } catch { /* keep null */ }

  return NextResponse.json({
    ok: true,
    symbol,
    asset,
    snapshot: snap,
    intradayBars,
    decisions: decisions ?? [],
    onWatchlist: onWatch ?? null,
    marketOpen,
    account,
    news,
  });
}
