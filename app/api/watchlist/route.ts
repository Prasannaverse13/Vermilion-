import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET  /api/watchlist        — list current user's watchlist
 * POST /api/watchlist        — add { symbol } to user's watchlist (source='user')
 * DELETE /api/watchlist?sym  — remove a symbol the user added (agent defaults are protected)
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("watchlist")
    .select("id, symbol, source, added_at")
    .eq("user_id", user.id)
    .order("source", { ascending: true }) // 'agent' first
    .order("added_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { symbol?: string };
  const symbol = (body.symbol ?? "").trim().toUpperCase();
  if (!/^[A-Z]{1,6}(\.[A-Z])?$/.test(symbol)) {
    return NextResponse.json({ error: "invalid symbol" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("watchlist")
    .upsert(
      { user_id: user.id, symbol, source: "user" },
      { onConflict: "user_id,symbol" },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const symbol = (url.searchParams.get("sym") ?? "").trim().toUpperCase();
  if (!symbol) return NextResponse.json({ error: "missing sym" }, { status: 400 });

  // RLS policy already blocks deleting agent-default rows; the
  // service-side guard below makes the error friendlier.
  const { data: existing } = await supabase
    .from("watchlist")
    .select("source")
    .eq("user_id", user.id)
    .eq("symbol", symbol)
    .single();
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.source === "agent") {
    return NextResponse.json(
      { error: "cannot remove agent default" },
      { status: 403 },
    );
  }

  const { error } = await supabase
    .from("watchlist")
    .delete()
    .eq("user_id", user.id)
    .eq("symbol", symbol);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
