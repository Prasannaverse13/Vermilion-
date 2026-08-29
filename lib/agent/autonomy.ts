/**
 * Vermilion — autonomous-agent primitives
 * ---------------------------------------
 * What "autonomous" means here, concretely:
 *   1. Self-wake     — run an evaluation cycle if the last one is stale
 *   2. Self-decide   — DeepSeek scores every symbol, refuses by default
 *   3. Self-prompt   — when something material happens, the agent posts a
 *                      message into its own chat session
 *   4. Self-heal     — wrap the decision write in retry/backoff, and
 *                      mark the cycle degraded if Alpaca is unreachable
 *   5. Adaptive skip — when the market is closed, refuse without LLM cost
 *
 * This module is intentionally tiny and side-effect-aware: the cron
 * route, the wake-on-visit page, and the manual button all funnel
 * through `runAutonomousCycle` so the agent behaves identically no
 * matter who (or what) triggered it.
 */

import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createClient as createServiceSupabase } from "@supabase/supabase-js";
import {
  getQuotes,
  getSnapshot,
  getAccountSummary,
  isMarketOpen,
  type AlpacaQuote,
} from "@/lib/alpaca/server";
import { deepseekChat, agentTools, type DeepSeekMessage } from "@/lib/ai/deepseek";
import { logActivity, captureNorthStars } from "./lifecycle";
import { createPendingDecision, getUserGoalSettings } from "./queue";

// ---- Tunables ---------------------------------------------------------------

export const DEFAULT_WATCHLIST = [
  "NVDA", "AAPL", "MSFT", "GOOGL", "META", "AMZN", "TSLA", "SPY",
  "VTI", "QQQ", "JPM", "AMD", "NFLX",
];

export const THRESHOLD = 60;
export const MAX_POSITION_PCT = 0.08;
export const ORDER_DOLLARS = 1000;

// Anything older than this counts as "stale" — wake-up logic uses it.
export const STALE_AFTER_MS = 15 * 60 * 1000; // 15 minutes

// Hard cap on symbols per cycle so a single run stays under 30s.
export const MAX_SYMBOLS_PER_CYCLE = 20;

// ---- Types ------------------------------------------------------------------

export type AgentDecision = {
  symbol: string;
  action: "buy" | "sell" | "short" | "cover" | "refuse";
  qty?: number;
  confidence: number;
  threshold: number;
  reasoning: string;
  sources: { tag: string; text: string }[];
  order_id?: string;
  fill_price?: number;
  error?: string;
};

export type CycleResult = {
  ok: boolean;
  marketOpen: boolean;
  evaluated: number;
  executed: number;
  refused: number;
  decisions: AgentDecision[];
  triggeredBy: "wake-on-visit" | "cron" | "manual" | "self-recovery";
  startedAt: string;
  finishedAt: string;
  degraded?: string;
  selfPrompt?: { posted: boolean; sessionId?: string; reason?: string };
};

// ---- Helpers ----------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function insertWithRetry(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  row: Record<string, unknown>,
  attempts = 3,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    const { error } = await supabase.from("decisions").insert(row);
    if (!error) return { ok: true };
    lastErr = error;
    await sleep(150 * (i + 1));
  }
  return { ok: false, error: lastErr instanceof Error ? lastErr.message : String(lastErr) };
}

async function evaluateOne(
  symbol: string,
  quote: AlpacaQuote,
  daily: { c: number; o: number; h: number; l: number; v: number; t: string } | undefined,
  summary: { cash: number; equity: number; buying_power: number; portfolio_value: number },
  marketOpen: boolean,
): Promise<AgentDecision> {
  const last = (quote.quote.ap + quote.quote.bp) / 2;
  const changePct = daily ? ((last - daily.c) / daily.c) * 100 : 0;
  const marketNote = marketOpen
    ? "Market is currently OPEN — orders can be placed."
    : "Market is currently CLOSED — orders cannot be placed. You must call action='refuse' for every symbol.";

  const messages: DeepSeekMessage[] = [
    {
      role: "system",
      content: `You are Vermilion, a self-auditing trading agent. You trade US equities on a paper Alpaca account. Your job is to refuse trades that don't have enough edge and to execute only when you are confident.

Strict rules:
- Default to "refuse". You must clear a confidence threshold of ${THRESHOLD} to execute.
- Never propose a position larger than ${MAX_POSITION_PCT * 100}% of equity in a single name.
- Be conservative. Volatility, news risk, and earnings proximity all lower confidence.
- If the market is closed, always refuse. Orders can't be placed.
- Always explain in plain English. No jargon. No emoji.`,
    },
    {
      role: "user",
      content: `Evaluate ${symbol}.

${marketNote}

Market data (latest available):
- Bid: $${quote.quote.bp.toFixed(2)}
- Ask: $${quote.quote.ap.toFixed(2)}
- Last: $${last.toFixed(2)}
- Today open: $${daily?.o?.toFixed(2) ?? "—"}
- Today close so far: $${daily?.c?.toFixed(2) ?? "—"}
- Today change: ${changePct.toFixed(2)}%

Account:
- Equity: $${summary.equity.toFixed(2)}
- Cash: $${summary.cash.toFixed(2)}
- Buying power: $${summary.buying_power.toFixed(2)}

Call evaluate_trade with your decision. Be honest about your uncertainty.`,
    },
  ];

  const res = await deepseekChat({ messages, tools: agentTools, tool_choice: "auto" });
  const toolCall = res.choices[0]?.message.tool_calls?.[0];
  if (!toolCall) {
    return {
      symbol,
      action: "refuse",
      confidence: 0,
      threshold: THRESHOLD,
      reasoning: "DeepSeek did not return a tool call. Defaulting to refuse.",
      sources: [],
    };
  }
  try {
    const args = JSON.parse(toolCall.function.arguments);
    return {
      symbol,
      action: args.action ?? "refuse",
      qty: args.qty,
      confidence: Math.max(0, Math.min(100, Number(args.confidence ?? 0))),
      threshold: args.threshold ?? THRESHOLD,
      reasoning: String(args.reasoning ?? "—"),
      sources: Array.isArray(args.sources)
        ? args.sources.slice(0, 4).map((s: { tag: string; text: string }) => ({
            tag: String(s.tag ?? "SOURCE"),
            text: String(s.text ?? ""),
          }))
        : [],
    };
  } catch {
    return {
      symbol,
      action: "refuse",
      confidence: 0,
      threshold: THRESHOLD,
      reasoning: "Could not parse DeepSeek response. Defaulting to refuse.",
      sources: [],
    };
  }
}

// ---- Self-prompt: post a system message into the user's chat ---------------
//
// When a cycle executes a real trade OR a fresh news event shows up, the
// agent posts a short note into a persistent "vermilion · morning brief"
// chat session. This is what makes the agent *look* autonomous on the
// dashboard — the user opens the chat and sees it talked to itself.

export async function selfPrompt(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string,
  payload: {
    cycleStartedAt: string;
    marketOpen: boolean;
    executed: AgentDecision[];
    refusedCount: number;
    evaluated: number;
    newsheadlines?: { symbol: string; headline: string }[];
  },
): Promise<{ posted: boolean; sessionId?: string; reason?: string }> {
  try {
    // Reuse a single pinned session for self-prompts, so the chat sidebar
    // has a stable "Vermilion · self-notes" thread.
    const { data: existing } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("user_id", userId)
      .eq("title", "Vermilion · self-notes")
      .limit(1);

    let sessionId = existing?.[0]?.id;
    if (!sessionId) {
      const { data: created, error: cErr } = await supabase
        .from("chat_sessions")
        .insert({ user_id: userId, title: "Vermilion · self-notes" })
        .select("id")
        .single();
      if (cErr || !created) {
        return { posted: false, reason: cErr?.message ?? "create_session_failed" };
      }
      sessionId = created.id;
    }

    // Decide whether to post. We always want a heartbeat when the
    // cron or wake-on-visit path ran — even a "refused everything"
    // cycle is evidence the agent is alive. The user should be able
    // to open the chat and see the agent's most recent activity
    // without it being empty.
    const hasExec = payload.executed.length > 0;
    const hasNews = (payload.newsheadlines?.length ?? 0) > 0;
    const isHeartbeat = !hasExec && !hasNews && payload.evaluated > 0;
    if (!hasExec && !hasNews && !isHeartbeat) {
      return { posted: false, sessionId, reason: "nothing_material" };
    }

    const lines: string[] = [];
    lines.push(
      `Cycle ran at ${new Date(payload.cycleStartedAt).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false })} ET — market ${payload.marketOpen ? "open" : "closed"}.`,
    );
    if (hasExec) {
      lines.push("");
      lines.push("Executed:");
      for (const d of payload.executed) {
        const px = d.fill_price ? ` @ $${d.fill_price.toFixed(2)}` : "";
        lines.push(`- ${d.action.toUpperCase()} ${d.qty ?? "?"} ${d.symbol}${px} — ${d.reasoning}`);
      }
    } else if (isHeartbeat) {
      // Heartbeat case — the agent woke up, looked, found no edge,
      // and is checking back in. Worth a one-liner so the chat isn't
      // silent.
      lines.push("");
      lines.push(
        `Swept ${payload.evaluated} symbols. Nothing cleared the ${THRESHOLD}% confidence bar — staying flat.`,
      );
    } else {
      lines.push("");
      lines.push(
        `Refused ${payload.refusedCount}/${payload.evaluated} symbols (no edge cleared the ${THRESHOLD}% threshold).`,
      );
    }
    if (hasNews) {
      lines.push("");
      lines.push("News worth flagging:");
      for (const n of payload.newsheadlines!.slice(0, 3)) {
        lines.push(`- ${n.symbol} — ${n.headline}`);
      }
    }
    const content = lines.join("\n");

    const { error: mErr } = await supabase.from("chat_messages").insert({
      session_id: sessionId,
      user_id: userId,
      role: "assistant",
      content,
      meta: {
        trigger: "self-prompt",
        executed: payload.executed.length,
        refused: payload.refusedCount,
        evaluated: payload.evaluated,
        newsCount: payload.newsheadlines?.length ?? 0,
        sources: [
          { tag: "AGENT", text: "Self-prompt triggered by autonomous cycle" },
          ...(hasExec ? [{ tag: "ALPACA", text: `${payload.executed.length} order(s) placed on paper account` }] : []),
          ...(hasNews ? [{ tag: "NEWS", text: `${payload.newsheadlines!.length} headline(s) ingested` }] : []),
        ],
      },
    });

    if (mErr) {
      return { posted: false, sessionId, reason: mErr.message };
    }
    return { posted: true, sessionId };
  } catch (e) {
    return { posted: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

// ---- The core cycle --------------------------------------------------------
//
// One entry-point. The cron, the wake-on-visit, and the manual button
// all call this. Differences (cron vs visit vs manual) are passed in
// as `triggeredBy` so the audit log captures who kicked it off.

export async function runAutonomousCycle(opts: {
  userId: string;
  triggeredBy: CycleResult["triggeredBy"];
  symbolsOverride?: string[];
  /** When true, the cycle will also self-prompt the chat if anything
   *  material happened. Defaults to true. */
  selfPrompt?: boolean;
  /** Pass a service-role client when running without a user session
   *  (cron mode). Otherwise defaults to the cookie-auth server client. */
  supabase?: Awaited<ReturnType<typeof createServerSupabase>>;
}): Promise<CycleResult> {
  const startedAt = new Date().toISOString();
  const supabase =
    opts.supabase ?? (await createServerSupabase());

  // 1. Watchlist: user rows + agent defaults, capped.
  const { data: watchRows } = await supabase
    .from("watchlist")
    .select("symbol, source")
    .eq("user_id", opts.userId);
  const userSymbols = new Set((watchRows ?? []).map((r) => r.symbol));
  const combined = Array.from(
    new Set([...(opts.symbolsOverride ?? []), ...userSymbols, ...DEFAULT_WATCHLIST]),
  ).slice(0, MAX_SYMBOLS_PER_CYCLE);

  // 2. Pre-flight: market + account.
  let marketOpen = false;
  let summary: Awaited<ReturnType<typeof getAccountSummary>> | null = null;
  try {
    [marketOpen, summary] = await Promise.all([isMarketOpen(), getAccountSummary()]);
  } catch (e) {
    return {
      ok: false,
      marketOpen: false,
      evaluated: 0,
      executed: 0,
      refused: 0,
      decisions: [],
      triggeredBy: opts.triggeredBy,
      startedAt,
      finishedAt: new Date().toISOString(),
      degraded: e instanceof Error ? e.message : String(e),
    };
  }
  if (!summary || summary.status !== "ACTIVE") {
    return {
      ok: false,
      marketOpen,
      evaluated: 0,
      executed: 0,
      refused: 0,
      decisions: [],
      triggeredBy: opts.triggeredBy,
      startedAt,
      finishedAt: new Date().toISOString(),
      degraded: `account_${summary?.status ?? "unknown"}`,
    };
  }

  // 3. Quotes for the whole watchlist.
  let quotes: Record<string, AlpacaQuote>;
  try {
    quotes = await getQuotes(combined);
  } catch (e) {
    return {
      ok: false,
      marketOpen,
      evaluated: 0,
      executed: 0,
      refused: 0,
      decisions: [],
      triggeredBy: opts.triggeredBy,
      startedAt,
      finishedAt: new Date().toISOString(),
      degraded: e instanceof Error ? e.message : String(e),
    };
  }

  // 4. Per-symbol evaluation.
  const decisions: AgentDecision[] = [];
  let executed = 0;
  let refused = 0;
  for (const symbol of combined) {
    const quote = quotes[symbol];
    const snap = await getSnapshot(symbol).catch(
      () =>
        ({} as {
          latestTrade?: { p: number; t: string };
          latestQuote?: { ap: number; as: number; bp: number; bs: number; t: string };
          dailyBar?: { c: number; o: number; h: number; l: number; v: number; t: string };
          prevDailyBar?: { c: number; o: number; h: number; l: number; v: number; t: string };
        }),
    );

    // Fast path: market closed + no live quote → refuse without LLM.
    if (!marketOpen && !quote?.quote) {
      const lastClose = snap.dailyBar?.c ?? snap.prevDailyBar?.c ?? null;
      const decision: AgentDecision = {
        symbol,
        action: "refuse",
        confidence: 0,
        threshold: THRESHOLD,
        reasoning: lastClose
          ? `Market is closed. Last close $${lastClose.toFixed(2)}; no live bid/ask to act on. Vermilion will revisit on the next session.`
          : "Market is closed. No live bid/ask available — refusing until the next session.",
        sources: [
          { tag: "MARKET", text: "Equity market CLOSED — orders cannot be placed." },
          ...(lastClose
            ? [{ tag: "REFERENCE", text: `Last close $${lastClose.toFixed(2)} (cached).` }]
            : []),
        ],
      };
      decisions.push(decision);
      refused++;
      await insertWithRetry(supabase, {
        user_id: opts.userId,
        symbol,
        action: decision.action,
        refused: true,
        confidence: decision.confidence,
        threshold: decision.threshold,
        reasoning: decision.reasoning,
        sources: decision.sources,
        qty: null,
        price: lastClose,
      });
      continue;
    }

    const effectiveQuote: AlpacaQuote =
      quote?.quote
        ? quote
        : {
            symbol,
            exchange: "SNAP",
            asset_class: "us_equity",
            status: "active",
            tradable: true,
            marginable: false,
            shortable: false,
            easy_to_borrow: false,
            quote: snap.latestQuote ?? {
              ap: 0,
              as: 0,
              bp: 0,
              bs: 0,
              t: new Date().toISOString(),
            },
          };

    const last =
      snap.latestTrade?.p ??
      (effectiveQuote.quote.ap && effectiveQuote.quote.bp
        ? (effectiveQuote.quote.ap + effectiveQuote.quote.bp) / 2
        : snap.dailyBar?.c ?? 0);

    const decision = await evaluateOne(symbol, effectiveQuote, snap.dailyBar, summary, marketOpen);
    decisions.push(decision);

    if (decision.action !== "refuse" && decision.confidence >= THRESHOLD && marketOpen) {
      try {
        const qty = Math.max(1, Math.floor(ORDER_DOLLARS / (decision.qty || last)));
        // Respect the user's autonomy settings + confidence
        // threshold. In all modes, we route the trade through the
        // pending-decision queue so the user gets an approve/decline
        // ping on their configured channels. The queue's
        // auto-approve grace period handles the "autonomous" mode.
        const goals = await getUserGoalSettings(opts.userId);
        if (decision.confidence >= goals.confidence_threshold) {
          const pending = await createPendingDecision(opts.userId, {
            decision_id: undefined,
            symbol,
            action: decision.action,
            qty,
            est_price: last,
            confidence: decision.confidence,
            threshold: decision.threshold,
            reasoning: decision.reasoning,
            sources: decision.sources,
            delaySeconds: goals.auto_approve_delay_s,
          });
          if (pending) {
            decision.order_id = pending.id; // surface the pending row id
            decision.fill_price = last;
            executed++;
          } else {
            decision.error = "create_pending_failed";
          }
        } else {
          // Below the user's per-user threshold but above the default
          // 60% — still refuse. Tag the decision as "below_user_threshold".
          decision.error = `below_user_threshold (${decision.confidence.toFixed(0)}% < ${goals.confidence_threshold}%)`;
          refused++;
        }
      } catch (err) {
        decision.error = err instanceof Error ? err.message : String(err);
      }
    } else {
      refused++;
    }

    await insertWithRetry(supabase, {
      user_id: opts.userId,
      symbol,
      action: decision.action,
      refused: decision.action === "refuse",
      confidence: decision.confidence,
      threshold: decision.threshold,
      reasoning: decision.reasoning,
      sources: decision.sources,
      qty: decision.qty,
      price: decision.fill_price ?? last,
    });
  }

  const finishedAt = new Date().toISOString();
  const base: CycleResult = {
    ok: true,
    marketOpen,
    evaluated: decisions.length,
    executed,
    refused,
    decisions,
    triggeredBy: opts.triggeredBy,
    startedAt,
    finishedAt,
  };

  // Self-prompt is opt-out, on by default — every trigger path gets it.
  if (opts.selfPrompt !== false) {
    try {
      const newsheadlines = await safeGetNewsheadlines();
      const prompt = await selfPrompt(supabase, opts.userId, {
        cycleStartedAt: startedAt,
        marketOpen,
        executed: decisions.filter((d) => !!d.order_id),
        refusedCount: refused,
        evaluated: decisions.length,
        newsheadlines,
      });
      base.selfPrompt = prompt;
    } catch {
      base.selfPrompt = { posted: false, reason: "self_prompt_threw" };
    }
  }

  // Advanced-autonomy side effects: log the cycle in the activity
  // table, capture north-star metrics. Best-effort — never block on
  // these.
  try {
    const kindMap: Record<CycleResult["triggeredBy"], "cron-cycle" | "manual-cycle" | "wake-on-visit" | "self-recovery"> = {
      cron: "cron-cycle",
      manual: "manual-cycle",
      "wake-on-visit": "wake-on-visit",
      "self-recovery": "self-recovery",
    };
    await logActivity(supabase, opts.userId, {
      kind: kindMap[opts.triggeredBy],
      title: `${opts.triggeredBy} · ${executed}/${decisions.length} executed`,
      detail:
        executed > 0
          ? `Placed ${executed} order(s) on paper account. Refused ${refused}.`
          : `No executions. Refused ${refused}/${decisions.length} (no edge cleared the ${THRESHOLD}% bar).`,
      symbols: decisions.filter((d) => !!d.order_id).map((d) => d.symbol),
      meta: {
        evaluated: decisions.length,
        executed,
        refused,
        marketOpen,
        durationMs: Date.now() - new Date(startedAt).getTime(),
      },
    });
  } catch {
    /* never block */
  }

  // North-star snapshot. Pulls last 7d of decisions + current positions
  // for the sparkline/trend computation. Cheap because indexed.
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: last7d }, { data: positions }] = await Promise.all([
      supabase
        .from("decisions")
        .select("action, refused, confidence")
        .eq("user_id", opts.userId)
        .gte("created_at", since),
      supabase
        .from("positions")
        .select("qty, current_price, entry_price, symbol")
        .eq("user_id", opts.userId)
        .is("closed_at", null),
    ]);
    await captureNorthStars(supabase, opts.userId, {
      decisionsLast7d: last7d ?? [],
      positions: (positions ?? []) as { qty: number; current_price: number; entry_price: number; symbol: string }[],
    });
  } catch {
    /* never block */
  }

  return base;
}

async function safeGetNewsheadlines(): Promise<{ symbol: string; headline: string }[]> {
  try {
    const { getNews } = await import("@/lib/alpaca/server");
    const { news } = await getNews(["NVDA", "AAPL", "TSLA", "AMD", "META"], 5);
    return news.slice(0, 5).map((n) => ({ symbol: n.symbols?.[0] ?? "—", headline: n.headline }));
  } catch {
    return [];
  }
}

// ---- Wake-on-visit ---------------------------------------------------------
//
// Returns true if the cycle was triggered (i.e. last decision was stale).
// Safe to call from a server component on every /app render.

export async function maybeWakeOnVisit(
  userId: string,
  supabaseOverride?: Awaited<ReturnType<typeof createServerSupabase>>,
): Promise<{
  triggered: boolean;
  reason: "fresh" | "stale_no_user" | "stale_market_closed" | "stale_ran_cycle";
  result?: CycleResult;
  lastDecisionAt?: string;
}> {
  const supabase = supabaseOverride ?? (await createServerSupabase());
  const { data: last } = await supabase
    .from("decisions")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (last?.created_at) {
    const age = Date.now() - new Date(last.created_at).getTime();
    if (age < STALE_AFTER_MS) {
      return { triggered: false, reason: "fresh", lastDecisionAt: last.created_at };
    }
  }

  // Stale — kick a cycle, but only if market is open. (Otherwise we'd
  // generate 13 "market closed" refusals on every page visit, which
  // is noise. The cron handles the closed-market path.)
  let marketOpen = false;
  try {
    marketOpen = await isMarketOpen();
  } catch {
    // Alpaca down — fall through; the cycle will mark itself degraded.
  }
  if (!marketOpen && last?.created_at) {
    return { triggered: false, reason: "stale_market_closed", lastDecisionAt: last.created_at };
  }

  const result = await runAutonomousCycle({ userId, triggeredBy: "wake-on-visit" });
  return { triggered: true, reason: "stale_ran_cycle", result, lastDecisionAt: last?.created_at };
}
