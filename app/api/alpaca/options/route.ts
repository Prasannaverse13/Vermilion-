import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getOptionChain,
  getOptionExpirations,
  getOptionSnapshots,
  composeStrategy,
  type OptionStrategy,
} from "@/lib/alpaca/server";

/**
 * /api/alpaca/options
 *
 *   GET  ?action=chain&underlying=AAPL&expiration=2026-09-19&type=call
 *   GET  ?action=expirations&underlying=AAPL
 *   GET  ?action=quote&symbols=AAPL260919C00225000,AAPL260919P00220000
 *   POST { strategy: OptionStrategy }   — composes a multi-leg
 *
 * Used by the chat agent (via MCP-style tool surface) and the
 * /app/options page.
 */

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "chain";
  const underlying = url.searchParams.get("underlying") ?? "";
  if (!underlying && action !== "quote") {
    return NextResponse.json({ error: "underlying_required" }, { status: 400 });
  }

  try {
    if (action === "chain") {
      const expiration = url.searchParams.get("expiration") ?? undefined;
      const type = (url.searchParams.get("type") ?? undefined) as "call" | "put" | undefined;
      const chain = await getOptionChain(underlying, { expiration, type });
      return NextResponse.json({ contracts: chain });
    }
    if (action === "expirations") {
      const exps = await getOptionExpirations(underlying);
      return NextResponse.json({ expirations: exps });
    }
    if (action === "quote") {
      const symbols = (url.searchParams.get("symbols") ?? "").split(",").filter(Boolean);
      if (symbols.length === 0) {
        return NextResponse.json({ error: "symbols_required" }, { status: 400 });
      }
      const snaps = await getOptionSnapshots(symbols);
      return NextResponse.json({ snapshots: snaps });
    }
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { strategy?: OptionStrategy };
  if (!body.strategy) {
    return NextResponse.json({ error: "strategy_required" }, { status: 400 });
  }

  try {
    const out = await composeStrategy(body.strategy);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
