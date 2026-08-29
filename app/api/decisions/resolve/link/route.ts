import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePendingDecision } from "@/lib/agent/queue";

/**
 * GET /api/decisions/resolve/link?token=<resolve_token>&action=approve|decline|comment
 *
 * One-click approve/decline from email links. The user is anonymous
 * (clicked from their inbox), so we identify them by the
 * resolve_token. We look up the pending decision, then resolve it
 * for its owner.
 *
 * Returns a tiny HTML page that just confirms the action and offers
 * a "Open Vermilion" button to the queue.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const action = (url.searchParams.get("action") ?? "approve") as
    | "approve"
    | "decline"
    | "comment";
  const comment = url.searchParams.get("comment") ?? undefined;

  if (!token) {
    return html("Missing token", "Please use the link from the email.");
  }

  const supabase = await createClient();
  const { data: pd } = await supabase
    .from("pending_decisions")
    .select("id, user_id, symbol, action, qty, status")
    .eq("resolve_token", token)
    .maybeSingle();
  if (!pd) {
    return html("Link expired", "This decision was already resolved or the link is no longer valid.");
  }
  if (pd.status !== "pending") {
    return html("Already resolved", `This decision was ${pd.status} earlier. No action needed.`);
  }

  const res = await resolvePendingDecision(pd.user_id, pd.id, action, {
    comment,
  });
  if (!res.ok) {
    return html("Action failed", res.reason ?? "Unknown error");
  }

  return html(
    action === "approve" ? "Approved" : action === "decline" ? "Declined" : "Comment saved",
    `Your action: <b>${action}</b> on ${pd.symbol} (${pd.action} ${pd.qty}). Status: <b>${res.status}</b>`,
  );
}

function html(title: string, body: string): NextResponse {
  const page = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,sans-serif;background:#0c0c0c;color:#d4d0c9;padding:48px;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
  <div style="max-width:480px;text-align:center">
    <p style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#878581;margin:0 0 8px">Vermilion</p>
    <h1 style="font-size:28px;line-height:1.2;margin:0 0 16px;color:#fff;font-weight:400">${title}</h1>
    <p style="font-size:15px;line-height:1.5;color:#d4d0c9">${body}</p>
    <a href="/app/queue" style="display:inline-block;margin-top:24px;background:#d4d0c9;color:#0c0c0c;padding:12px 24px;border-radius:100px;text-decoration:none;font-weight:600;font-size:14px">Open Vermilion</a>
  </div>
</body></html>`;
  return new NextResponse(page, { headers: { "Content-Type": "text/html" } });
}
