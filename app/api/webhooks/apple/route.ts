import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePendingDecision } from "@/lib/agent/queue";

/**
 * POST /api/webhooks/apple
 *
 * Apple Business Chat inbound message webhook. The format mirrors
 * the standard iMessage payload: `messages[].body.text` for free
 * text and `messages[].interactiveData` for list replies / quick
 * replies.
 *
 * The Apple Business Chat platform requires a registered business
 * account. This endpoint is wired but won't receive traffic until
 * the user completes the Apple registration. It's structured to
 * match the documented Apple BCS webhook shape:
 * https://developer.apple.com/documentation/businesschat
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    messages?: Array<{
      from: string; // recipient_apple_id
      body?: { text?: string };
      interactiveData?: {
        id?: string;
        title?: string;
      };
    }>;
  };

  const supabase = await createClient();
  for (const m of body.messages ?? []) {
    const userId = await findUserByAppleId(m.from);
    if (!userId) continue;

    let action: "approve" | "decline" | "comment" | null = null;
    let token: string | null = null;
    let comment: string | undefined;

    if (m.interactiveData?.id) {
      const parts = m.interactiveData.id.split("_");
      const verb = parts[0];
      token = parts.slice(1).join("_");
      if (verb === "approve" || verb === "decline" || verb === "comment") {
        action = verb;
      }
    } else if (m.body?.text) {
      action = "comment";
      comment = m.body.text;
    }

    if (action === "comment" && !token) {
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

async function findUserByAppleId(appleId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("user_goals").select("user_id, notifications");
  for (const r of rows ?? []) {
    const n = r.notifications as { apple?: { recipient_apple_id: string } } | null;
    if (n?.apple?.recipient_apple_id === appleId) return r.user_id;
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
