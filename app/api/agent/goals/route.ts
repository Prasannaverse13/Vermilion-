import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/agent/goals
 *
 * Returns the user's editable goal settings: targets, autonomy
 * level, auto-approve delay, and per-channel notification config.
 * Creates a default row on first call.
 *
 * PUT /api/agent/goals
 *
 * Body: a partial of the fields the user wants to change.
 * Persists and returns the updated row.
 */

const DEFAULTS = {
  target_refusal_rate: 70,
  target_edge_rate: 40,
  target_sharpe: 1.0,
  max_drawdown_pct: 15,
  position_cap_pct: 8,
  confidence_threshold: 60,
  autonomy_level: "suggest" as const,
  auto_approve_delay_s: 300,
  notifications: {} as Record<string, unknown>,
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let { data } = await supabase
    .from("user_goals")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) {
    const { data: created } = await supabase
      .from("user_goals")
      .insert({ user_id: user.id, ...DEFAULTS })
      .select()
      .single();
    data = created;
  }
  return NextResponse.json({ goals: data });
}

export async function PUT(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Whitelist allowed fields
  const allowed: Record<string, unknown> = {};
  for (const k of [
    "target_refusal_rate",
    "target_edge_rate",
    "target_sharpe",
    "max_drawdown_pct",
    "position_cap_pct",
    "confidence_threshold",
    "autonomy_level",
    "auto_approve_delay_s",
    "notifications",
  ]) {
    if (k in body) allowed[k] = body[k];
  }
  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "no_fields" }, { status: 400 });
  }
  allowed.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("user_goals")
    .upsert({ user_id: user.id, ...DEFAULTS, ...allowed }, { onConflict: "user_id" })
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ goals: data });
}
