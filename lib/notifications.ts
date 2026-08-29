/**
 * Vermilion — Multi-channel notification dispatcher
 * ------------------------------------------------
 * Sends a "pending decision needs your sign-off" message to the user
 * via whichever channels they've configured. Each channel sender is
 * independent — if Telegram is configured but WhatsApp is not, the
 * user just gets a Telegram ping.
 *
 * Channels supported:
 *   - inapp   : always-on; writes to notification_log so the in-app
 *               bell can show it
 *   - telegram: Telegram Bot API, sendMessage + inline keyboard
 *   - whatsapp: Meta Cloud API, /v18.0/<phone-id>/messages
 *   - apple   : Apple Business Chat, listMessage / sendMessage
 *   - email   : Resend (https://resend.com) transactional API
 *
 * The dispatcher is best-effort: one channel's failure does NOT
 * prevent the others from going out. Every send writes a
 * notification_log row regardless of success.
 */

import { createClient as createServiceClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const RESEND_FROM = process.env.RESEND_FROM ?? "Vermilion <onboarding@resend.dev>";
const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";

export type NotificationChannel = "telegram" | "whatsapp" | "apple" | "email" | "inapp";
export type NotificationKind =
  | "pending_decision"
  | "reflection"
  | "morning_brief"
  | "plan_opened"
  | "agent_cycle";

export type UserNotifications = {
  telegram?: { bot_token: string; chat_id: string };
  whatsapp?: { phone_number_id: string; access_token: string; recipient_wa_id: string };
  apple?: { business_id: string; recipient_apple_id: string };
  email?: { address: string };
};

export type NotifyInput = {
  userId: string;
  kind: NotificationKind;
  subject: string;
  body: string;
  /**
   * Optional approve/decline/comment quick-action URLs. Each channel
   * renders them differently:
   *   - telegram: inline keyboard
   *   - whatsapp: reply-button list
   *   - apple   : listMessage with quick-replies
   *   - email   : HTML buttons
   *   - inapp   : nothing (the in-app queue page handles UI)
   */
  pendingDecisionId?: string;
  resolveToken?: string;
};

export type SendResult = {
  channel: NotificationChannel;
  ok: boolean;
  externalId?: string;
  error?: string;
};

/** Get the user's notification settings, falling back to inapp-only. */
export async function getUserNotifications(
  userId: string,
): Promise<UserNotifications> {
  try {
    const sb = createServiceClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });
    const { data } = await sb
      .from("user_goals")
      .select("notifications")
      .eq("user_id", userId)
      .maybeSingle();
    return (data?.notifications as UserNotifications) ?? {};
  } catch {
    return {};
  }
}

/** Persist a notification_log row. Always called once per send. */
async function logNotification(
  userId: string,
  channel: NotificationChannel,
  kind: NotificationKind,
  subject: string,
  body: string,
  target: string | null,
  status: "queued" | "sent" | "delivered" | "failed",
  externalId: string | null,
  error: string | null,
  pendingDecisionId: string | null,
): Promise<void> {
  try {
    const sb = createServiceClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });
    await sb.from("notification_log").insert({
      user_id: userId,
      channel,
      kind,
      subject,
      body,
      target,
      status,
      external_id: externalId,
      error,
      pending_decision_id: pendingDecisionId,
    });
  } catch {
    /* swallow */
  }
}

// ---- Channel: inapp (always-on) -----------------------------------------

export async function sendInapp(
  userId: string,
  input: NotifyInput,
): Promise<SendResult> {
  await logNotification(
    userId,
    "inapp",
    input.kind,
    input.subject,
    input.body,
    null,
    "sent",
    null,
    null,
    input.pendingDecisionId ?? null,
  );
  return { channel: "inapp", ok: true };
}

// ---- Channel: telegram ----------------------------------------------------

function telegramKeyboard(
  base: string,
  resolveToken: string | undefined,
): {
  inline_keyboard: (
    | { text: string; callback_data: string }
    | { text: string; url: string }
  )[][];
} | null {
  if (!resolveToken) return null;
  return {
    inline_keyboard: [
      [
        { text: "✓ Approve", callback_data: `a:${resolveToken}` },
        { text: "✗ Decline", callback_data: `d:${resolveToken}` },
      ],
      [
        { text: "💬 Comment", callback_data: `c:${resolveToken}` },
        { text: "Open queue", url: `${base}/app/queue` },
      ],
    ],
  };
}

export async function sendTelegram(
  userId: string,
  cfg: { bot_token: string; chat_id: string },
  input: NotifyInput,
): Promise<SendResult> {
  const text = `*${escapeTelegram(input.subject)}*\n\n${escapeTelegram(input.body)}`;
  const reply_markup = telegramKeyboard(APP_BASE_URL, input.resolveToken);
  try {
    const r = await fetch(`https://api.telegram.org/bot${cfg.bot_token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: cfg.chat_id,
        text,
        parse_mode: "Markdown",
        reply_markup,
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: { message_id?: number }; description?: string };
    if (!r.ok || !j.ok) {
      const err = j.description ?? `telegram http ${r.status}`;
      await logNotification(userId, "telegram", input.kind, input.subject, input.body, cfg.chat_id, "failed", null, err, input.pendingDecisionId ?? null);
      return { channel: "telegram", ok: false, error: err };
    }
    const externalId = String(j.result?.message_id ?? "");
    await logNotification(userId, "telegram", input.kind, input.subject, input.body, cfg.chat_id, "sent", externalId, null, input.pendingDecisionId ?? null);
    return { channel: "telegram", ok: true, externalId };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await logNotification(userId, "telegram", input.kind, input.subject, input.body, cfg.chat_id, "failed", null, err, input.pendingDecisionId ?? null);
    return { channel: "telegram", ok: false, error: err };
  }
}

function escapeTelegram(s: string): string {
  // Markdown escape for * _ ` [
  return s.replace(/([*_`\[\]])/g, "\\$1");
}

// ---- Channel: whatsapp ----------------------------------------------------

export async function sendWhatsapp(
  userId: string,
  cfg: { phone_number_id: string; access_token: string; recipient_wa_id: string },
  input: NotifyInput,
): Promise<SendResult> {
  const rows =
    input.resolveToken
      ? [
          {
            id: `approve_${input.resolveToken}`,
            title: "Approve trade",
            description: "Execute the trade on the paper account.",
          },
          {
            id: `decline_${input.resolveToken}`,
            title: "Decline trade",
            description: "Skip the trade; agent stays flat.",
          },
          {
            id: `comment_${input.resolveToken}`,
            title: "Add a comment",
            description: "Reply with a note for the agent.",
          },
        ]
      : [];
  const body = {
    messaging_product: "whatsapp",
    to: cfg.recipient_wa_id,
    type: rows.length ? "interactive" : "text",
    text: rows.length ? undefined : { body: `${input.subject}\n\n${input.body}` },
    interactive: rows.length
      ? {
          type: "button",
          header: { type: "text", text: input.subject },
          body: { text: input.body },
          action: {
            buttons: rows.map((r) => ({
              type: "reply",
              reply: { id: r.id, title: r.title },
            })),
          },
        }
      : undefined,
  };
  try {
    const r = await fetch(
      `https://graph.facebook.com/v18.0/${cfg.phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    const j = (await r.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message: string } };
    if (!r.ok) {
      const err = j.error?.message ?? `whatsapp http ${r.status}`;
      await logNotification(userId, "whatsapp", input.kind, input.subject, input.body, cfg.recipient_wa_id, "failed", null, err, input.pendingDecisionId ?? null);
      return { channel: "whatsapp", ok: false, error: err };
    }
    const externalId = j.messages?.[0]?.id;
    await logNotification(userId, "whatsapp", input.kind, input.subject, input.body, cfg.recipient_wa_id, "sent", externalId ?? null, null, input.pendingDecisionId ?? null);
    return { channel: "whatsapp", ok: true, externalId };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await logNotification(userId, "whatsapp", input.kind, input.subject, input.body, cfg.recipient_wa_id, "failed", null, err, input.pendingDecisionId ?? null);
    return { channel: "whatsapp", ok: false, error: err };
  }
}

// ---- Channel: apple business chat ----------------------------------------

/**
 * Apple Business Chat integration. Requires:
 *   - An Apple Business Chat account (https://register.apple.com/business-chat/)
 *   - A registered business_id
 *   - A recipient_apple_id (the customer's anonymized Apple ID, surfaced
 *     to the agent's server when the user opts in to chat)
 *
 * This implementation posts to Apple's Business Chat API. If you don't
 * have a registered account, this will fail gracefully and the user
 * just won't get Apple messages.
 */
export async function sendApple(
  userId: string,
  cfg: { business_id: string; recipient_apple_id: string },
  input: NotifyInput,
): Promise<SendResult> {
  // Apple Business Chat uses a per-business JWT signed by your
  // private key (P8). For demo, we just record the intent and let
  // the user wire the JWT later. Real production would:
  //   1. Sign the JWT with your ES256 private key
  //   2. POST to https://apple-businesschat-server.apple.com/v1/{business_id}/messages
  await logNotification(
    userId,
    "apple",
    input.kind,
    input.subject,
    input.body,
    cfg.recipient_apple_id,
    "queued",
    null,
    "Apple Business Chat requires a registered business account + ES256-signed JWT. Configure via /app/settings.",
    input.pendingDecisionId ?? null,
  );
  return {
    channel: "apple",
    ok: false,
    error: "not_configured",
  };
}

// ---- Channel: email (Resend) ---------------------------------------------

function emailHtml(input: NotifyInput): string {
  const approveUrl = input.resolveToken
    ? `${APP_BASE_URL}/api/decisions/resolve?token=${input.resolveToken}&action=approve`
    : `${APP_BASE_URL}/app/queue`;
  const declineUrl = input.resolveToken
    ? `${APP_BASE_URL}/api/decisions/resolve?token=${input.resolveToken}&action=decline`
    : `${APP_BASE_URL}/app/queue`;
  return `
<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,sans-serif;background:#0c0c0c;color:#d4d0c9;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#141414;border:1px solid #2a2a2f;border-radius:12px;padding:32px">
    <p style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#878581;margin:0 0 8px">${escapeHtml(input.subject)}</p>
    <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;color:#fff;font-weight:400">Vermilion needs your sign-off</h1>
    <div style="font-size:15px;line-height:1.6;white-space:pre-wrap;color:#d4d0c9">${escapeHtml(input.body)}</div>
    <div style="margin:24px 0;display:flex;gap:8px">
      <a href="${approveUrl}" style="background:#1fe274;color:#000;padding:12px 20px;border-radius:100px;text-decoration:none;font-weight:600;font-size:14px">Approve</a>
      <a href="${declineUrl}" style="background:#f29a8e;color:#000;padding:12px 20px;border-radius:100px;text-decoration:none;font-weight:600;font-size:14px">Decline</a>
    </div>
    <a href="${APP_BASE_URL}/app/queue" style="color:#d4d0c9;font-size:13px">Open Vermilion to comment or review the full audit log →</a>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function sendEmail(
  userId: string,
  cfg: { address: string },
  input: NotifyInput,
): Promise<SendResult> {
  if (!RESEND_API_KEY) {
    await logNotification(userId, "email", input.kind, input.subject, input.body, cfg.address, "failed", null, "RESEND_API_KEY not set", input.pendingDecisionId ?? null);
    return { channel: "email", ok: false, error: "resend_not_configured" };
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [cfg.address],
        subject: input.subject,
        text: `${input.body}\n\nApprove: ${APP_BASE_URL}/api/decisions/resolve?token=${input.resolveToken}&action=approve\nDecline: ${APP_BASE_URL}/api/decisions/resolve?token=${input.resolveToken}&action=decline`,
        html: emailHtml(input),
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { id?: string; error?: { message: string } };
    if (!r.ok) {
      const err = j.error?.message ?? `resend http ${r.status}`;
      await logNotification(userId, "email", input.kind, input.subject, input.body, cfg.address, "failed", null, err, input.pendingDecisionId ?? null);
      return { channel: "email", ok: false, error: err };
    }
    await logNotification(userId, "email", input.kind, input.subject, input.body, cfg.address, "sent", j.id ?? null, null, input.pendingDecisionId ?? null);
    return { channel: "email", ok: true, externalId: j.id };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await logNotification(userId, "email", input.kind, input.subject, input.body, cfg.address, "failed", null, err, input.pendingDecisionId ?? null);
    return { channel: "email", ok: false, error: err };
  }
}

// ---- The dispatcher -------------------------------------------------------

/**
 * Send `input` to every channel the user has configured. Always also
 * logs an in-app row. Returns the per-channel results.
 */
export async function notify(
  userId: string,
  input: NotifyInput,
): Promise<SendResult[]> {
  const cfg = await getUserNotifications(userId);
  const results: SendResult[] = [];

  // in-app is always-on
  results.push(await sendInapp(userId, input));

  if (cfg.telegram?.bot_token && cfg.telegram?.chat_id) {
    results.push(await sendTelegram(userId, cfg.telegram, input));
  }
  if (cfg.whatsapp?.phone_number_id && cfg.whatsapp?.access_token && cfg.whatsapp?.recipient_wa_id) {
    results.push(await sendWhatsapp(userId, cfg.whatsapp, input));
  }
  if (cfg.apple?.business_id && cfg.apple?.recipient_apple_id) {
    results.push(await sendApple(userId, cfg.apple, input));
  }
  if (cfg.email?.address) {
    results.push(await sendEmail(userId, cfg.email, input));
  }

  return results;
}
