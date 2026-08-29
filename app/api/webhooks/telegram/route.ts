import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePendingDecision } from "@/lib/agent/queue";
import { sendTelegram } from "@/lib/notifications";

/**
 * POST /api/webhooks/telegram
 *
 * Telegram Bot API webhook. Receives `callback_query` (button
 * presses) and `message` (free-text replies). The user's `chat_id`
 * is the link to the bot config in `user_goals.notifications.telegram`.
 *
 * The route is publicly accessible (Telegram needs to reach it).
 * Security model: anyone can POST, but only callback_data values we
 * minted (`a:<token>` / `d:<token>` / `c:<token>`) do anything.
 * Free-text messages are treated as comments on the most recent
 * pending decision for that chat.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    callback_query?: {
      id: string;
      data?: string;
      from: { id: number };
      message?: { chat: { id: number }; message_id: number };
    };
    message?: { text?: string; chat: { id: number }; from: { id: number } };
  };

  const supabase = await createClient();

  // Find which user owns this chat_id. We do a small reverse lookup
  // in user_goals.notifications.
  const chatId = String(
    body.callback_query?.message?.chat.id ?? body.message?.chat.id ?? "",
  );
  if (!chatId) {
    return NextResponse.json({ ok: true, ignored: "no_chat" });
  }

  const userId = await findUserByTelegramChat(chatId);
  if (!userId) {
    // Tell Telegram we saw it but couldn't route
    if (body.callback_query?.id) {
      await answerCallback(body.callback_query.id, "Vermilion isn't linked to this chat. Open the app and add this chat in Settings.");
    }
    return NextResponse.json({ ok: true, ignored: "no_user" });
  }

  if (body.callback_query?.data) {
    // Button press: a|d|c:<resolve_token>
    const m = body.callback_query.data.match(/^([adc]):(.+)$/);
    if (m) {
      const verb = m[1] === "a" ? "approve" : m[1] === "d" ? "decline" : "comment";
      const pendingId = await findPendingByToken(userId, m[2]);
      if (pendingId) {
        const res = await resolvePendingDecision(userId, pendingId, verb);
        await answerCallback(
          body.callback_query.id,
          res.ok
            ? verb === "approve"
              ? "✓ Approved. Order placed."
              : verb === "decline"
                ? "✗ Declined."
                : "Comment saved."
            : `Could not ${verb}: ${res.reason}`,
        );
        // Optional follow-up message
        const cfg = await getTelegramCfg(userId);
        if (cfg) {
          await sendTelegram(userId, cfg, {
            userId,
            kind: "pending_decision",
            subject: `Vermilion · ${verb}`,
            body: `Action recorded: ${verb} on decision ${pendingId.slice(0, 8)}. Status: ${res.status ?? "unknown"}.`,
            pendingDecisionId: pendingId,
          });
        }
      } else {
        await answerCallback(body.callback_query.id, "Token expired or already resolved.");
      }
    }
    return NextResponse.json({ ok: true });
  }

  // Free-text message → comment on the most recent pending decision
  if (body.message?.text) {
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
        comment: body.message.text,
      });
      const cfg = await getTelegramCfg(userId);
      if (cfg) {
        await sendTelegram(userId, cfg, {
          userId,
          kind: "pending_decision",
          subject: "Vermilion · comment saved",
          body: `Got it. Saved as comment on your most recent pending decision.`,
        });
      }
    }
  }
  return NextResponse.json({ ok: true });
}

async function answerCallback(id: string, text: string) {
  // We need the bot token to answerCallback; but we don't know which
  // user it came from here. Best-effort: if there's a unique
  // active bot in the system, use it. In practice each user has
  // their own bot and we should match. For now skip — Telegram will
  // show the alert on the next message we send.
  return;
}

async function findUserByTelegramChat(chatId: string): Promise<string | null> {
  const supabase = await createClient();
  // We can't easily query inside a jsonb field for `chat_id = X`
  // via PostgREST, so we fetch every user_goals and filter in memory.
  // This is fine because user_goals is small (one row per user).
  const { data: rows } = await supabase
    .from("user_goals")
    .select("user_id, notifications");
  for (const r of rows ?? []) {
    const n = r.notifications as { telegram?: { chat_id: string } } | null;
    if (n?.telegram?.chat_id === chatId) return r.user_id;
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

async function getTelegramCfg(
  userId: string,
): Promise<{ bot_token: string; chat_id: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_goals")
    .select("notifications")
    .eq("user_id", userId)
    .maybeSingle();
  const n = data?.notifications as { telegram?: { bot_token: string; chat_id: string } } | null;
  return n?.telegram ?? null;
}
