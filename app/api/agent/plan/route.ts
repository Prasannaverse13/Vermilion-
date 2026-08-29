import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { openPlan, updatePlan, logActivity } from "@/lib/agent/lifecycle";

/**
 * POST /api/agent/plan
 *
 * Open a new plan, or update/close an existing one.
 *
 * Body shapes:
 *   { action: "open",    title, thesis, symbols? }
 *   { action: "update",  id, status?, progress?, outcome? }
 *   { action: "close",   id, outcome }
 *
 * Used by:
 *   - The chat-side tool call (create_plan)
 *   - The agent's own cycle (after observing a pattern)
 *   - The user (manually, from the UI later)
 */

type PlanBody =
  | { action: "open"; title: string; thesis: string; symbols?: string[] }
  | { action: "update"; id: string; status?: "open" | "progressing" | "closed" | "abandoned"; progress?: number; outcome?: string }
  | { action: "close"; id: string; outcome: string };

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: PlanBody;
  try {
    body = (await req.json()) as PlanBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (body.action === "open") {
    if (!body.title || !body.thesis) {
      return NextResponse.json({ error: "title_and_thesis_required" }, { status: 400 });
    }
    const id = await openPlan(supabase, user.id, {
      title: body.title,
      thesis: body.thesis,
      symbols: body.symbols,
    });
    if (!id) {
      return NextResponse.json({ error: "create_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id });
  }

  if (body.action === "update" || body.action === "close") {
    const update: { status?: "open" | "progressing" | "closed" | "abandoned"; progress?: number; outcome?: string } = {};
    if (body.action === "close") {
      update.status = "closed";
      update.outcome = body.outcome;
      update.progress = 100;
    } else {
      if (body.status) update.status = body.status;
      if (body.progress != null) update.progress = body.progress;
      if (body.outcome) update.outcome = body.outcome;
    }
    const ok = await updatePlan(supabase, user.id, body.id, update);
    if (!ok) {
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}

/**
 * GET /api/agent/plan — list the user's open + recent plans.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data } = await supabase
    .from("agent_plans")
    .select("id, title, thesis, status, symbols, progress, opened_at, closed_at, outcome")
    .eq("user_id", user.id)
    .order("opened_at", { ascending: false })
    .limit(20);
  return NextResponse.json({ plans: data ?? [] });
}
