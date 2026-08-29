import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deepseekChatStream, chatTools, type DeepSeekMessage } from "@/lib/ai/deepseek";
import { getAccountSummary, getPositions, getSnapshot, isMarketOpen, getNews } from "@/lib/alpaca/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/chat/stream
 * Server-Sent Events streaming version of /api/chat. Returns a
 * `text/event-stream` with one `data: { delta, done }` event per token,
 * then a final `data: { done: true, sources, message }` event.
 *
 * Trade proposals (tool calls) are not streamed — clients should fall
 * back to POST /api/chat for those.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    content?: string;
    focus?: "all" | "audit" | "market" | "positions";
    sessionId?: string;
  };
  const content = (body.content ?? "").trim();
  const focus = body.focus ?? "all";
  let sessionId: string | undefined = body.sessionId;
  if (!content) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (content.length > 2000) {
    return NextResponse.json({ error: "message too long" }, { status: 400 });
  }

  // Resolve or create session (parallel with portfolio fetch below)
  if (sessionId) {
    const { data: own } = await supabase
      .from("chat_sessions")
      .select("id, title")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!own) return NextResponse.json({ error: "session not found" }, { status: 404 });
  } else {
    const title = content.slice(0, 60).replace(/\s+/g, " ").trim() || "New chat";
    const { data: created, error: createErr } = await supabase
      .from("chat_sessions")
      .insert({ user_id: user.id, title })
      .select("id")
      .single();
    if (createErr || !created) {
      return NextResponse.json({ error: createErr?.message ?? "session create failed" }, { status: 500 });
    }
    sessionId = created.id;
  }

  // Persist user message
  await supabase.from("chat_messages").insert({
    user_id: user.id,
    role: "user",
    content,
    session_id: sessionId,
  });

  // Load history + decisions + portfolio all in parallel.
  const [historyRes, decisionsRes, acctPosMarket] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("id, role, content, meta, created_at")
      .eq("user_id", user.id)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("decisions")
      .select("symbol, action, refused, confidence, reasoning, sources, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(15),
    Promise.allSettled([
      getAccountSummary(),
      getPositions(),
      isMarketOpen(),
    ]),
  ]);
  const historyAsc = (historyRes.data ?? []).reverse();
  const recentDecisions = decisionsRes.data ?? [];

  let portfolio = "no portfolio";
  let marketCtx = "market status unknown";
  if (acctPosMarket[0].status === "fulfilled" && acctPosMarket[1].status === "fulfilled") {
    const acct = (acctPosMarket[0] as any).value;
    const pos = (acctPosMarket[1] as any).value ?? [];
    const open = acctPosMarket[2].status === "fulfilled" ? (acctPosMarket[2] as any).value : false;
    const positionsBlock = pos.length
      ? pos.slice(0, 8).map(
          (p: any) =>
            `  - ${p.symbol}: ${p.qty} sh @ avg $${Number(p.avg_entry_price).toFixed(2)}, now $${Number(p.current_price).toFixed(2)}, P/L $${Number(p.unrealized_pl).toFixed(2)}`,
        ).join("\n")
      : "  (no open positions)";
    portfolio = `Equity: $${acct.equity.toFixed(2)}; Cash: $${acct.cash.toFixed(2)}; Buying power: $${acct.buying_power.toFixed(2)}.\nOpen positions:\n${positionsBlock}`;
    marketCtx = open ? "Market is OPEN." : "Market is CLOSED.";
  }

  const decisionsBlock = (recentDecisions ?? [])
    .map(
      (d: any) =>
        `  - ${d.created_at} ET · ${d.symbol} ${d.action}${d.refused ? " (refused)" : ""} · ${d.confidence ?? "?"}% conf · "${(d.reasoning ?? "").slice(0, 140)}"`,
    )
    .join("\n");

  const focusBlock =
    focus === "audit"
      ? "Focus: AUDIT LOG. The user is asking about past decisions. Always cite the decision row from the audit log with date and confidence."
      : focus === "market"
        ? "Focus: MARKET. The user wants live market context. Reference Alpaca snapshots / quotes."
        : focus === "positions"
          ? "Focus: MY POSITIONS. The user wants their Alpaca account context. Reference current positions, equity, P/L."
          : "Focus: ALL. Use whatever context is relevant.";

  const messages: DeepSeekMessage[] = [
    {
      role: "system",
      content: `You are Vermilion, a self-auditing paper-trading agent on Alpaca MCP. You are chatting with the user about their portfolio, decisions, and the market.

${focusBlock}

Connected tools (MCP): getAccountSummary, getPositions, getSnapshot, getNews, isMarketOpen, propose_trade (proposal only — user confirms).

Rules:
- Be concise. Plain English. No emoji. No jargon.
- Reference the user's actual numbers when answering.
- For trade intents, call propose_trade (not just describe).
- Cite the audit log when asked about past decisions.
- Threshold: 60% confidence, position ≤ 8% of equity.
- ${marketCtx}

CURRENT PORTFOLIO (from Alpaca MCP):
${portfolio}

RECENT DECISIONS (audit log, newest first):
${decisionsBlock || "  (none yet)"}
`,
    },
    ...historyAsc.slice(0, -1).map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    })),
    { role: "user", content },
  ];

  // Stream the response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullText = "";
      try {
        for await (const delta of deepseekChatStream({
          messages,
          tools: chatTools,
          temperature: 0.2,
          max_tokens: 400,
        })) {
          fullText += delta;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`),
          );
        }

        // Persist the assistant message + add minimal sources
        const sources: { tag: string; text: string }[] = [];
        if (/\b(portfolio|position|cash|equity|buying|balance|p\/l|pnl)\b/i.test(content)) {
          const eq = (portfolio.match(/Equity: \$([0-9,.]+)/) ?? [])[1];
          if (eq) sources.push({ tag: "MCP", text: `Equity $${eq} via Alpaca` });
        }
        if (recentDecisions && recentDecisions.length > 0 && /\b(why|refuse|decide|decision|audit|past|earlier|before|history)\b/i.test(content)) {
          const top = recentDecisions[0] as any;
          sources.push({
            tag: "AUDIT",
            text: `${top.symbol} ${top.action}${top.refused ? " (refused)" : ""} · ${top.confidence ?? "?"}%`,
          });
        }

        const { data: msg } = await supabase
          .from("chat_messages")
          .insert({
            user_id: user.id,
            role: "assistant",
            content: fullText || "(no response)",
            meta: sources.length ? { sources } : null,
            session_id: sessionId,
          })
          .select()
          .single();

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ done: true, message: msg, sessionId })}\n\n`,
          ),
        );
        controller.close();
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: err instanceof Error ? err.message : String(err) })}\n\n`,
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
