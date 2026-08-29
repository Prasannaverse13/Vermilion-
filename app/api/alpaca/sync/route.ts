import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getAccount,
  getPositions,
  type AlpacaPosition,
} from "@/lib/alpaca/server";

/**
 * GET /api/alpaca/sync
 *
 * Pulls the live account + positions from Alpaca and upserts them
 * into the user's Supabase `positions` table. Then refreshes the
 * `decisions` rows with a small "sync" record so the UI knows the
 * data is fresh.
 *
 * Called from the "Sync from Alpaca" button on /app.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 1. Pull account + positions from Alpaca
  let account;
  let positions: AlpacaPosition[] = [];
  try {
    [account, positions] = await Promise.all([getAccount(), getPositions()]);
  } catch (err) {
    return NextResponse.json(
      {
        error: "alpaca_unreachable",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  // 2. Upsert positions into Supabase
  //    - close out any open positions no longer in Alpaca
  //    - upsert current ones with their live entry / current price
  const symbolSet = new Set(positions.map((p) => p.symbol));
  const upsertRows = positions.map((p) => ({
    user_id: user.id,
    symbol: p.symbol,
    name: p.symbol,
    qty: Number(p.qty),
    entry_price: Number(p.avg_entry_price),
    current_price: Number(p.current_price),
    opened_at: new Date().toISOString(),
  }));

  if (upsertRows.length > 0) {
    const { error: upErr } = await supabase
      .from("positions")
      .upsert(upsertRows, { onConflict: "user_id,symbol,opened_at" });
    if (upErr) {
      return NextResponse.json(
        { error: "supabase_upsert", message: upErr.message },
        { status: 500 },
      );
    }
  }

  // 3. Close any open positions in Supabase that aren't in Alpaca anymore
  const { data: openRows } = await supabase
    .from("positions")
    .select("id, symbol")
    .eq("user_id", user.id)
    .is("closed_at", null);
  const toClose = (openRows ?? [])
    .filter((r) => !symbolSet.has(r.symbol))
    .map((r) => r.id);
  if (toClose.length > 0) {
    await supabase
      .from("positions")
      .update({ closed_at: new Date().toISOString() })
      .in("id", toClose);
  }

  return NextResponse.json({
    ok: true,
    account: {
      cash: Number(account.cash),
      equity: Number(account.equity),
      buying_power: Number(account.buying_power),
      portfolio_value: Number(account.portfolio_value),
      status: account.status,
    },
    positions: positions.map((p) => ({
      symbol: p.symbol,
      qty: Number(p.qty),
      side: p.side,
      entry_price: Number(p.avg_entry_price),
      current_price: Number(p.current_price),
      market_value: Number(p.market_value),
      unrealized_pl: Number(p.unrealized_pl),
      unrealized_plpc: Number(p.unrealized_plpc),
    })),
  });
}

// Also allow GET for the manual refresh button
export const GET = POST;
