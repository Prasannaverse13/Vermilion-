import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { postReflection } from "@/lib/agent/lifecycle";

/**
 * POST /api/cron/reflect
 *
 * Runs at 16:10 ET Mon–Fri. End-of-day self-audit per user.
 * Each user gets exactly one reflection row per session_date.
 *
 * ?user=<uuid>   — single user
 * (no param)     — all users
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

  // "Today's session" — everything since the most recent ET market
  // open (09:30 ET) — but if 09:30 ET hasn't happened yet today
  // (i.e. it's pre-market), fall back to "the last 24 hours" so we
  // still pick up the post-market decisions from yesterday.
  const now = new Date();
  const etDateStr = now.toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  const etOpenUtcMs = new Date(`${etDateStr}T09:30:00-04:00`).getTime();
  const last24hMs = Date.now() - 24 * 60 * 60 * 1000;
  // If 09:30 ET is in the future (pre-market or weekend morning),
  // use last 24h; otherwise use the more recent of 09:30 today and
  // last 24h.
  const sinceMs = etOpenUtcMs > now.getTime() ? last24hMs : Math.max(etOpenUtcMs, last24hMs);
  const since = new Date(sinceMs).toISOString();
  console.log(`[reflect init] etDateStr=${etDateStr} etOpen=${new Date(etOpenUtcMs).toISOString()} last24h=${new Date(last24hMs).toISOString()} since=${since} users=${users.length}`);

  const results: { userId: string; posted: boolean; reason?: string }[] = [];
  for (const u of users) {
    const [{ data: decs }, { data: pos }] = await Promise.all([
      service
        .from("decisions")
        .select("symbol, action, refused, confidence, reasoning, price, qty, created_at")
        .eq("user_id", u.id)
        .gte("created_at", since),
      service
        .from("positions")
        .select("symbol, qty, entry_price, current_price")
        .eq("user_id", u.id)
        .is("closed_at", null),
    ]);
    const decisions = (decs ?? []).map((d) => ({
      symbol: d.symbol as string,
      action: d.action as string,
      refused: !!d.refused,
      confidence: Number(d.confidence ?? 0),
      fill_price: d.price != null ? Number(d.price) : undefined,
      reasoning: (d.reasoning as string | null) ?? "",
      created_at: d.created_at as string | undefined,
    }));
    console.log(`[reflect] user=${u.id.slice(0,8)} since=${since} decisions=${decisions.length} positions=${(pos ?? []).length}`);
    const positions = ((pos ?? []) as { symbol: string; qty: number; entry_price: number; current_price: number }[]).map((p) => ({
      ...p,
      qty: Number(p.qty),
      entry_price: Number(p.entry_price),
      current_price: Number(p.current_price),
    }));
    const r = await postReflection(service, u.id, { decisions, positions });
    results.push({ userId: u.id, posted: r.posted, reason: r.reason });
  }

  return NextResponse.json({
    ok: true,
    since,
    usersProcessed: results.length,
    results,
  });
}

export const GET = POST;
