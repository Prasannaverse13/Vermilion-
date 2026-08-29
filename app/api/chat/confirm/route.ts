import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { placeOrder, getAccountSummary, isMarketOpen } from "@/lib/alpaca/server";

/**
 * POST /api/chat/confirm
 * body: { messageId: string }
 * - The user just clicked "Confirm" on a trade-proposal chat message.
 * - Verify the proposal still belongs to them.
 * - Run it through the same gates as the agent loop: market open,
 *   account active, qty ≥ 1, position ≤ 8% of equity.
 * - If all checks pass, place the order in Alpaca, write a decision
 *   row, and update the proposal with the order id.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { messageId?: string };
  const messageId = body.messageId;
  if (!messageId) {
    return NextResponse.json({ error: "missing messageId" }, { status: 400 });
  }

  // 1. Fetch the proposal
  const { data: msg, error: fetchErr } = await supabase
    .from("chat_messages")
    .select("id, role, meta, created_at")
    .eq("id", messageId)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !msg) {
    return NextResponse.json({ error: "proposal not found" }, { status: 404 });
  }
  if (msg.role !== "proposal") {
    return NextResponse.json({ error: "not a proposal" }, { status: 400 });
  }
  const meta = (msg.meta ?? {}) as {
    symbol?: string;
    action?: "buy" | "sell" | "short" | "cover";
    qty?: number;
    confidence?: number;
    reasoning?: string;
    sources?: { tag: string; text: string }[];
    order_id?: string;
  };
  if (meta.order_id) {
    return NextResponse.json({ error: "already executed" }, { status: 400 });
  }
  if (!meta.symbol || !meta.action || !meta.qty) {
    return NextResponse.json({ error: "malformed proposal" }, { status: 400 });
  }

  // 2. Pre-flight: market open + account active
  const marketOpen = await isMarketOpen();
  if (!marketOpen) {
    return NextResponse.json(
      { error: "market closed", message: "Cannot place orders while the market is closed." },
      { status: 400 },
    );
  }
  const acct = await getAccountSummary();
  if (acct.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "account inactive", status: acct.status },
      { status: 400 },
    );
  }

  // 3. Position-size cap (8% of equity)
  const lastPrice = Number(meta.sources?.[0]?.text?.match(/\$([0-9.]+)/)?.[1] ?? 0);
  if (lastPrice > 0) {
    const notional = lastPrice * meta.qty;
    if (notional > acct.equity * 0.08) {
      return NextResponse.json(
        {
          error: "position too large",
          message: `Proposed size $${notional.toFixed(0)} exceeds 8% of equity ($${(acct.equity * 0.08).toFixed(0)}).`,
        },
        { status: 400 },
      );
    }
  }

  // 4. Place the order
  let order;
  try {
    order = await placeOrder({
      symbol: meta.symbol,
      qty: Math.max(1, Math.floor(meta.qty)),
      side: meta.action === "sell" || meta.action === "short" ? "sell" : "buy",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "order failed", message: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  const fillPrice = order.filled_avg_price ? Number(order.filled_avg_price) : null;

  // 5. Persist a decision row
  await supabase.from("decisions").insert({
    user_id: user.id,
    symbol: meta.symbol,
    action: meta.action,
    refused: false,
    confidence: meta.confidence ?? null,
    threshold: 60,
    reasoning: `[user-confirmed chat proposal] ${meta.reasoning ?? ""}`,
    sources: [
      ...(meta.sources ?? []),
      { tag: "WORKFLOW", text: "User confirmed trade proposal from chat." },
    ],
    qty: meta.qty,
    price: fillPrice,
  });

  // 6. Mark the proposal as executed
  await supabase
    .from("chat_messages")
    .update({ meta: { ...meta, order_id: order.id, fill_price: fillPrice } })
    .eq("id", messageId);

  // 7. Append an assistant note about the execution (in the same session)
  const { data: parentMsg } = await supabase
    .from("chat_messages")
    .select("session_id")
    .eq("id", messageId)
    .single();
  await supabase.from("chat_messages").insert({
    user_id: user.id,
    role: "assistant",
    content: `Done. ${meta.action.toUpperCase()} ${meta.qty} ${meta.symbol} ${fillPrice ? `@ $${fillPrice.toFixed(2)}` : "(order placed)"} · order id ${order.id.slice(0, 8)}…`,
    session_id: parentMsg?.session_id ?? null,
  });

  return NextResponse.json({
    ok: true,
    order_id: order.id,
    fill_price: fillPrice,
  });
}
