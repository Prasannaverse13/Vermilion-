import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePendingDecision } from "@/lib/agent/queue";

/**
 * POST /api/webhooks/resend
 *
 * Inbound email webhook from Resend (https://resend.com/docs/dashboard/webhooks/introduction).
 * When a user replies to the Vermilion notification email, Resend
 * forwards the message to this endpoint. We treat the reply text
 * as a comment on the most recent pending decision.
 *
 * Configure in Resend dashboard: Settings → Webhooks → add this URL.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    type?: string;
    data?: {
      from?: string;
      to?: string[];
      subject?: string;
      text?: string;
      html?: string;
    };
  };

  // Resend sends events of type `email.received` (or `inbound`)
  // for replies. We accept both.
  if (!body.data) return NextResponse.json({ ok: true, ignored: "no_data" });
  const from = body.data.from ?? "";
  const text = body.data.text ?? "";
  if (!from || !text) {
    return NextResponse.json({ ok: true, ignored: "no_content" });
  }

  const supabase = await createClient();
  // Find user by email
  const { data: rows } = await supabase
    .from("user_goals")
    .select("user_id, notifications");
  let userId: string | null = null;
  for (const r of rows ?? []) {
    const n = r.notifications as { email?: { address: string } } | null;
    if (n?.email?.address && from.toLowerCase().includes(n.email.address.toLowerCase())) {
      userId = r.user_id;
      break;
    }
  }
  if (!userId) return NextResponse.json({ ok: true, ignored: "no_user" });

  // Comment on the most recent pending decision
  const { data: latest } = await supabase
    .from("pending_decisions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest) {
    await resolvePendingDecision(userId, latest.id, "comment", {
      comment: text.slice(0, 1000),
    });
  }
  return NextResponse.json({ ok: true });
}
