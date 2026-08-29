import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePendingDecision } from "@/lib/agent/queue";

/**
 * POST /api/webhooks/whatsapp
 *
 * Meta WhatsApp Cloud API webhook. Receives `messages` (inbound
 * from a user) and `button` clicks (from a button we sent).
 *
 * Button id format: `approve_<token>` | `decline_<token>` |
 * `comment_<token>`.
 *
 * For verification (the GET challenge), implement the meta verify_token
 * handshake.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === (process.env.WHATSAPP_VERIFY_TOKEN ?? "vermilion")) {
    return new NextResponse(challenge ?? "");
  }
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            from: string;
            type: "text" | "button" | "interactive";
            text?: { body: string };
            button?: { text: string; payload: string };
            interactive?: {
              button_reply?: { id: string; title: string };
              list_reply?: { id: string; title: string; description?: string };
            };
          }>;
        };
      }>;
    }>;
  };

  const messages = body.entry?.[0]?.changes?.[0]?.value?.messages ?? [];
  if (messages.length === 0) return NextResponse.json({ ok: true });

  const supabase = await createClient();
  for (const m of messages) {
    const from = m.from;
    // Find user by whatsapp.recipient_wa_id == from
    const userId = await findUserByWhatsappFrom(from);
    if (!userId) continue;

    let action: "approve" | "decline" | "comment" | null = null;
    let token: string | null = null;
    let comment: string | undefined;

    if (m.type === "button" && m.button?.payload) {
      // payload format: "approve_<token>" etc.
      const parts = m.button.payload.split("_");
      const verb = parts[0];
      token = parts.slice(1).join("_");
      if (verb === "approve" || verb === "decline" || verb === "comment") {
        action = verb;
      }
    } else if (m.type === "interactive") {
      const id = m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id ?? "";
      const parts = id.split("_");
      const verb = parts[0];
      token = parts.slice(1).join("_");
      if (verb === "approve" || verb === "decline" || verb === "comment") {
        action = verb;
      }
    } else if (m.type === "text" && m.text?.body) {
      // Free-text → comment on the most recent pending
      action = "comment";
      comment = m.text.body;
    }

    if (action === "comment" && !token) {
      // Free-text path: attach to the most recent pending
      const { data: latest } = await supabase
        .from("pending_decisions")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest) {
        await resolvePendingDecision(userId, latest.id, "comment", { comment });
      }
      continue;
    }

    if (!action || !token) continue;
    const pendingId = await findPendingByToken(userId, token);
    if (pendingId) {
      await resolvePendingDecision(userId, pendingId, action, { comment });
    }
  }
  return NextResponse.json({ ok: true });
}

async function findUserByWhatsappFrom(from: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("user_goals")
    .select("user_id, notifications");
  for (const r of rows ?? []) {
    const n = r.notifications as { whatsapp?: { recipient_wa_id: string } } | null;
    if (n?.whatsapp?.recipient_wa_id === from) return r.user_id;
  }
  return null;
}

async function findPendingByToken(
  userId: string,
  token: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pending_decisions")
    .select("id")
    .eq("user_id", userId)
    .eq("resolve_token", token)
    .eq("status", "pending")
    .maybeSingle();
  return data?.id ?? null;
}
