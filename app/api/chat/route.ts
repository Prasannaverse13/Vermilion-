import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deepseekChat, chatTools, type DeepSeekMessage } from "@/lib/ai/deepseek";
import { getAccountSummary, getPositions, getSnapshot, isMarketOpen, getNews } from "@/lib/alpaca/server";

/**
 * POST /api/chat
 * body: { content: string, focus?: "all"|"audit"|"market"|"positions", sessionId?: string }
 *
 * - If sessionId is provided and belongs to the user, attaches the
 *   user message to it.
 * - If sessionId is omitted, creates a new session and returns its
 *   id in the response so the client can switch the active session.
 * - Title is auto-derived from the first user message.
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

  // 1. Resolve / create session
  if (sessionId) {
    const { data: own } = await supabase
      .from("chat_sessions")
      .select("id, title")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!own) {
      return NextResponse.json({ error: "session not found" }, { status: 404 });
    }
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
  if (!sessionId) {
    return NextResponse.json({ error: "session resolve failed" }, { status: 500 });
  }

  // 2. Persist the user message
  await supabase.from("chat_messages").insert({
    user_id: user.id,
    role: "user",
    content,
    session_id: sessionId,
  });

  // 3. Load recent history for THIS session (last 20)
  const { data: history } = await supabase
    .from("chat_messages")
    .select("id, role, content, meta, created_at")
    .eq("user_id", user.id)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(20);
  const historyAsc = (history ?? []).reverse();

  // 4. Load recent decisions (audit log)
  const { data: recentDecisions } = await supabase
    .from("decisions")
    .select("symbol, action, refused, confidence, reasoning, sources, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(15);
  const decisionsBlock = (recentDecisions ?? [])
    .map(
      (d) =>
        `  - ${d.created_at} ET · ${d.symbol} ${d.action}${d.refused ? " (refused)" : ""} · ${d.confidence ?? "?"}% conf · "${(d.reasoning ?? "").slice(0, 140)}"`,
    )
    .join("\n");

  // 5. Portfolio + market context — fetch all three in parallel so
  // the user-visible latency is the slowest single call, not the sum.
  let portfolio = "no portfolio";
  let marketCtx = "market status unknown";
  let liveSnapshot: { symbol: string; last: number | null } | null = null;
  let newsItems: Array<{ headline: string; summary: string; source: string; url: string; created_at: string }> = [];
  try {
    const [acct, pos, open] = await Promise.all([
      getAccountSummary(),
      getPositions(),
      isMarketOpen(),
    ]);
    const positionsBlock = pos.length
      ? pos
          .slice(0, 8)
          .map(
            (p) =>
              `  - ${p.symbol}: ${p.qty} sh @ avg $${Number(p.avg_entry_price).toFixed(2)}, now $${Number(p.current_price).toFixed(2)}, P/L $${Number(p.unrealized_pl).toFixed(2)}`,
          )
          .join("\n")
      : "  (no open positions)";
    portfolio = `Equity: $${acct.equity.toFixed(2)}; Cash: $${acct.cash.toFixed(2)}; Buying power: $${acct.buying_power.toFixed(2)}.\nOpen positions:\n${positionsBlock}`;
    marketCtx = open ? "Market is OPEN." : "Market is CLOSED.";

    // Only fetch a live snapshot when the message looks like a
    // market question. Greeting / chitchat skips the extra round
    // trip to Alpaca and gets back to the user ~1s faster.
    const asksAboutMarket = /\b(price|quote|trading|doing|today|now|move|chart|up|down|ticker|stock|share)\b/i.test(content);
    const asksAboutNews = /\b(news|headline|article|story|report|announce|announcement|press|release|earnings|filing)\b/i.test(content);
    const symMatch = (asksAboutMarket || asksAboutNews) ? content.match(/\b([A-Z]{1,5})\b/) : null;

    // Fire snapshot + news in parallel — never blocks the chat if
    // either is slow (best-effort, with 2s budget).
    if (symMatch) {
      const withTimeout = <T,>(p: Promise<T>, ms: number) =>
        Promise.race<T>([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
      const [snapResult, newsResult] = await Promise.allSettled([
        withTimeout(getSnapshot(symMatch[1]), 2000),
        asksAboutNews
          ? withTimeout(getNews([symMatch[1]], 5), 2000)
          : Promise.resolve(null),
      ]);
      if (snapResult.status === "fulfilled") {
        const last = snapResult.value.latestTrade?.p ?? snapResult.value.dailyBar?.c ?? null;
        liveSnapshot = { symbol: symMatch[1], last };
      }
      if (newsResult.status === "fulfilled" && newsResult.value) {
        newsItems = newsResult.value.news ?? [];
      }
    }
  } catch { /* keep fallback */ }

  const focusBlock =
    focus === "audit"
      ? "Focus: AUDIT LOG. The user is asking about past decisions. Always cite the decision row from the audit log with date and confidence."
      : focus === "market"
        ? "Focus: MARKET. The user wants live market context. Reference Alpaca snapshots / quotes."
        : focus === "positions"
          ? "Focus: MY POSITIONS. The user wants their Alpaca account context. Reference current positions, equity, P/L."
          : "Focus: ALL. Use whatever context is relevant.";

  // 6. Build messages
  const messages: DeepSeekMessage[] = [
    {
      role: "system",
      content: `You are Vermilion, a self-auditing paper-trading agent connected to the user's Alpaca paper-trading account via MCP. You are chatting with the user about their portfolio, decisions, and the market.

${focusBlock}

Connected tools (MCP):
- getAccountSummary() — equity, cash, buying power
- getPositions() — open positions, qty, avg entry, current price, P/L
- getSnapshot(symbol) — latest trade price, daily bar
- getNews(symbols, limit) — latest headlines from Alpaca's news feed for given tickers
- isMarketOpen() — current market status
- propose_trade — returns a trade proposal card for the user to confirm; NEVER places an order directly

Rules:
- Be concise. Plain English. No emoji. No jargon.
- Reference the user's actual numbers when answering.
- If the user asks you to consider a trade, you MUST use the propose_trade tool with symbol, action, qty, confidence, reasoning, sources. NEVER execute directly — the user confirms.
- When the user asks "why did you refuse X" or similar questions about past decisions, READ the audit log section in your context and answer with the actual reasoning that was recorded. Cite the date and confidence.
- When the user says "buy me X shares of Y" or "sell Y" or "short Z", call propose_trade. Do not just describe the trade in prose.
- Threshold for executing is 60% confidence and position size ≤ 8% of equity. State these in your reasoning.
- ${marketCtx}

Context you'll need:

CURRENT PORTFOLIO (from Alpaca MCP):
${portfolio}
${liveSnapshot ? `\nLIVE SNAPSHOT: ${liveSnapshot.symbol} @ $${liveSnapshot.last?.toFixed(2) ?? "n/a"}` : ""}
${newsItems.length > 0
  ? `\nLATEST NEWS (from Alpaca MCP, for ${newsItems[0]?.headline ? "the symbols in the question" : "the requested symbols"}):\n${newsItems
      .slice(0, 5)
      .map(
        (n, i) =>
          `  ${i + 1}. [${n.source}] ${n.headline}\n     ${n.summary.slice(0, 200)}${n.summary.length > 200 ? "…" : ""}`,
      )
      .join("\n")}`
  : ""}

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

  // 7. Call DeepSeek
  const tradeIntent = /\b(buy|sell|short|cover|purchase|acquire|dispose)\b/i.test(content);
  const resp = await deepseekChat({
    messages,
    tools: chatTools,
    tool_choice: tradeIntent ? ("required" as any) : "auto",
    temperature: 0.2,
    max_tokens: 400,
  });

  const choice = resp.choices[0];
  if (!choice) {
    return NextResponse.json({ error: "no response" }, { status: 502 });
  }

  // 8. Persist + return
  const toolCall = choice.message.tool_calls?.[0];

  if (toolCall?.function.name === "propose_options_strategy") {
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(toolCall.function.arguments); } catch { /* keep empty */ }
    const kind = String(parsed.kind ?? "");
    const underlying = String(parsed.underlying ?? "").toUpperCase();
    const qty = Math.max(1, Math.floor(Number(parsed.qty ?? 1)));
    const expiry = String(parsed.expiry ?? "");
    const reasoning = String(parsed.reasoning ?? "");
    if (!kind || !underlying || !expiry) {
      const note = await persistAssistant(
        supabase,
        user.id,
        "I tried to compose an options strategy but the parameters were incomplete. Tell me the underlying (e.g. AAPL), expiry (e.g. 2026-09-19), and which strategy (covered call, protective put, bull call spread, bear put spread).",
        sessionId,
      );
      return NextResponse.json({ ok: true, message: note, sessionId });
    }

    try {
      const { composeStrategy } = await import("@/lib/alpaca/server");
      const strategy: Parameters<typeof composeStrategy>[0] = kind === "covered_call"
        ? { kind, underlying, qty, expiry, strike_offset_pct: Number(parsed.strike_offset_pct ?? 2) }
        : kind === "protective_put"
          ? { kind, underlying, qty, expiry, strike_offset_pct: Number(parsed.strike_offset_pct ?? 5) }
          : kind === "bull_call_spread"
            ? {
                kind,
                underlying,
                qty,
                expiry,
                long_strike_offset_pct: Number(parsed.long_strike_offset_pct ?? 2),
                short_strike_offset_pct: Number(parsed.short_strike_offset_pct ?? 5),
              }
            : {
                kind,
                underlying,
                qty,
                expiry,
                long_strike_offset_pct: Number(parsed.long_strike_offset_pct ?? 5),
                short_strike_offset_pct: Number(parsed.short_strike_offset_pct ?? 2),
              };
      const out = await composeStrategy(strategy);
      if (out.legs.length === 0) {
        const note = await persistAssistant(
          supabase,
          user.id,
          `I tried to build a ${kind.replace(/_/g, " ")} on ${underlying} but couldn't find matching strikes. ${out.notes}`,
          sessionId,
        );
        return NextResponse.json({ ok: true, message: note, sessionId });
      }

      // Park the legs as pending options decisions
      const { createPendingDecision } = await import("@/lib/agent/queue");
      const pendingIds: string[] = [];
      const legSummary = out.legs.map((l) => `${l.side.toUpperCase()} ${l.qty} ${l.symbol}`).join(" / ");
      for (const leg of out.legs) {
        const pending = await createPendingDecision(user.id, {
          symbol: leg.symbol,
          action: leg.side === "buy" ? "buy" : "sell",
          qty: leg.qty,
          est_price: leg.limit_price ?? 0,
          confidence: 70,
          threshold: 60,
          reasoning: `${kind.replace(/_/g, " ")} on ${underlying} (leg ${leg.side.toUpperCase()} ${leg.qty}): ${reasoning}\n\n${out.notes}`,
          sources: [{ tag: "STRATEGY", text: kind }, { tag: "EXPIRY", text: expiry }, { tag: "UNDERLYING", text: underlying }],
          delaySeconds: 300,
        });
        if (pending) pendingIds.push(pending.id);
      }
      const note = await persistAssistant(
        supabase,
        user.id,
        `Strategy composed: **${kind.replace(/_/g, " ")}** on ${underlying} (${qty} contracts, ${expiry}). Legs: ${legSummary}.\n\n${out.notes}\n\nBoth legs are in your queue (top-right "Queue" link). Approve to send, decline to skip, or comment to refine.`,
        sessionId,
        [{ tag: "STRATEGY", text: kind }, { tag: "UNDERLYING", text: underlying }, { tag: "EXPIRY", text: expiry }],
      );
      return NextResponse.json({ ok: true, message: note, sessionId, pendingIds });
    } catch (e) {
      const note = await persistAssistant(
        supabase,
        user.id,
        `Options strategy composition failed: ${e instanceof Error ? e.message : String(e)}`,
        sessionId,
      );
      return NextResponse.json({ ok: true, message: note, sessionId });
    }
  }

  if (toolCall?.function.name === "create_plan") {
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(toolCall.function.arguments); } catch { /* keep empty */ }
    const title = String(parsed.title ?? "").slice(0, 120).trim();
    const thesis = String(parsed.thesis ?? "").slice(0, 600).trim();
    const symbols = Array.isArray(parsed.symbols)
      ? (parsed.symbols as unknown[]).slice(0, 8).map((s) => String(s).toUpperCase())
      : [];
    if (!title || !thesis) {
      const note = await persistAssistant(
        supabase,
        user.id,
        "I tried to open a plan but the title and thesis were missing. Try: 'Plan: AAPL range-bound 220-240'.",
        sessionId,
      );
      return NextResponse.json({ ok: true, message: note, sessionId });
    }
    const { openPlan, logActivity } = await import("@/lib/agent/lifecycle");
    const planId = await openPlan(supabase, user.id, { title, thesis, symbols });
    if (!planId) {
      const note = await persistAssistant(
        supabase,
        user.id,
        `I couldn't open the plan "${title}" — database write failed. Try again or check your connection.`,
        sessionId,
      );
      return NextResponse.json({ ok: true, message: note, sessionId });
    }
    const note = await persistAssistant(
      supabase,
      user.id,
      `Plan opened: ${title}.\n\n${thesis}${symbols.length ? `\n\nWatching: ${symbols.join(", ")}.` : ""}\n\nI'll track this on /app/goals and update progress as new data comes in.`,
      sessionId,
      [{ tag: "AGENT", text: `Plan ${planId.slice(0, 8)} created` }],
    );
    return NextResponse.json({ ok: true, message: note, sessionId });
  }

  if (toolCall?.function.name === "propose_trade") {
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(toolCall.function.arguments); } catch { /* keep empty */ }

    const symbol = String(parsed.symbol ?? "").toUpperCase();
    if (!/^[A-Z]{1,6}(\.[A-Z])?$/.test(symbol)) {
      const note = await persistAssistant(
        supabase,
        user.id,
        `I can't propose a trade on that — the symbol looks invalid.`,
        sessionId,
      );
      return NextResponse.json({ ok: true, message: note, sessionId });
    }
    let lastPrice: number | null = null;
    try {
      const snap = await getSnapshot(symbol);
      lastPrice = snap.latestTrade?.p ?? snap.dailyBar?.c ?? null;
    } catch { /* keep null */ }
    if (lastPrice == null) {
      const note = await persistAssistant(
        supabase,
        user.id,
        `I tried to look up ${symbol} but no live price was available. Want me to try again, or pick a different symbol?`,
        sessionId,
      );
      return NextResponse.json({ ok: true, message: note, sessionId });
    }

    const proposedQty = Math.max(1, Math.floor(Number(parsed.qty ?? 1)));
    const meta = {
      symbol,
      action: parsed.action,
      qty: proposedQty,
      confidence: Number(parsed.confidence ?? 0),
      reasoning: String(parsed.reasoning ?? ""),
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      lastPrice,
    };
    const { data: msg } = await supabase
      .from("chat_messages")
      .insert({
        user_id: user.id,
        role: "proposal",
        content: String(parsed.reasoning ?? "Trade proposal"),
        meta,
        session_id: sessionId,
      })
      .select()
      .single();
    return NextResponse.json({ ok: true, message: msg, sessionId });
  }

  // Plain text reply — attach sources
  const text = choice.message.content ?? "(no response)";
  const sources: { tag: string; text: string }[] = [];
  if (liveSnapshot && liveSnapshot.last != null) {
    sources.push({
      tag: "ALPACA",
      text: `${liveSnapshot.symbol} @ $${liveSnapshot.last.toFixed(2)} (live)`,
    });
  }
  if (newsItems.length > 0) {
    sources.push({
      tag: "NEWS",
      text: `${newsItems.length} headline${newsItems.length === 1 ? "" : "s"} · ${newsItems[0].source}`,
    });
  }
  if (recentDecisions && recentDecisions.length > 0 && /\b(why|refuse|decide|decision|audit|past|earlier|before|history)\b/i.test(content)) {
    const top = recentDecisions[0];
    sources.push({
      tag: "AUDIT",
      text: `${top.symbol} ${top.action}${top.refused ? " (refused)" : ""} · ${top.confidence ?? "?"}%`,
    });
  }
  if (/\b(portfolio|position|cash|equity|buying|balance|p\/l|pnl)\b/i.test(content)) {
    const eq = (portfolio.match(/Equity: \$([0-9,.]+)/) ?? [])[1];
    if (eq) sources.push({ tag: "MCP", text: `Equity $${eq} via Alpaca` });
  }
  // No DEEPSEEK fallback — only show sources when the reply is actually
  // backed by MCP/audit/news data.

  const note = await persistAssistant(supabase, user.id, text, sessionId, sources);
  return NextResponse.json({ ok: true, message: note, sessionId });
}

async function persistAssistant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  text: string,
  sessionId: string,
  sources?: { tag: string; text: string }[],
) {
  const { data } = await supabase
    .from("chat_messages")
    .insert({
      user_id: userId,
      role: "assistant",
      content: text,
      meta: sources && sources.length ? { sources } : null,
      session_id: sessionId,
    })
    .select()
    .single();
  return data;
}

/**
 * GET /api/chat?session=<id>
 * - no session: returns list of sessions (sidebar data)
 * - with session: returns messages for that session
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session");
  if (!sessionId) {
    // List all sessions for the sidebar
    const { data, error } = await supabase
      .from("chat_sessions")
      .select("id, title, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, sessions: data ?? [] });
  }

  // Specific session messages
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, role, content, meta, created_at")
    .eq("user_id", user.id)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, messages: data ?? [] });
}
