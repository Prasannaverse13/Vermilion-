import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePendingDecision } from "@/lib/agent/queue";

/**
 * POST /api/decisions/resolve
 *
 * Resolve a pending decision by id + action. Used by the in-app
 * queue page and the dashboard queue widget.
 *
 * Body: { id: string, action: "approve" | "decline" | "comment", comment?: string }
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    action?: "approve" | "decline" | "comment";
    comment?: string;
  };
  if (!body.id || !body.action) {
    return NextResponse.json({ error: "id_and_action_required" }, { status: 400 });
  }

  const res = await resolvePendingDecision(user.id, body.id, body.action, {
    comment: body.comment,
  });
  if (!res.ok) {
    return NextResponse.json({ error: res.reason ?? "failed" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, status: res.status });
}
