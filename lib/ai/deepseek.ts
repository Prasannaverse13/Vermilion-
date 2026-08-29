import "server-only";

/**
 * Server-side DeepSeek client. Vermilion uses DeepSeek for the
 * decision-reasoning step. Server-only — never imported from a
 * Client Component.
 *
 * Endpoint: https://api.deepseek.com/v1/chat/completions
 * Model:    deepseek-chat   (or deepseek-reasoner for the r1 model)
 */

const DEEPSEEK_BASE = "https://api.deepseek.com/v1";
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || "";

export type DeepSeekMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

export type DeepSeekTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
};

export type DeepSeekResponse = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }[];
    };
    finish_reason: "stop" | "length" | "tool_calls" | "content_filter";
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type DeepSeekChatOptions = {
  model?: "deepseek-chat" | "deepseek-reasoner";
  messages: DeepSeekMessage[];
  tools?: DeepSeekTool[];
  tool_choice?: "auto" | "none";
  temperature?: number;
  max_tokens?: number;
};

export async function deepseekChat(
  opts: DeepSeekChatOptions,
): Promise<DeepSeekResponse> {
  if (!DEEPSEEK_KEY) {
    throw new Error(
      "DeepSeek key not configured. Add DEEPSEEK_API_KEY to .env.local.",
    );
  }
  const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_KEY}`,
    },
    body: JSON.stringify({
      model: opts.model ?? "deepseek-chat",
      messages: opts.messages,
      tools: opts.tools,
      tool_choice: opts.tool_choice,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.max_tokens ?? 1500,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DeepSeek ${res.status}: ${text}`);
  }
  return (await res.json()) as DeepSeekResponse;
}

/**
 * Streaming variant — yields text deltas as DeepSeek produces them.
 * Skips tool calls (the chat route doesn't stream tool_calls today;
 * it only streams plain text answers).
 */
export async function* deepseekChatStream(
  opts: DeepSeekChatOptions,
): AsyncGenerator<string, void, void> {
  if (!DEEPSEEK_KEY) {
    throw new Error("DeepSeek key not configured.");
  }
  const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_KEY}`,
    },
    body: JSON.stringify({
      model: opts.model ?? "deepseek-chat",
      messages: opts.messages,
      tools: opts.tools,
      tool_choice: opts.tool_choice,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.max_tokens ?? 1500,
      stream: true,
    }),
    cache: "no-store",
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`DeepSeek ${res.status}: ${text}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE frames end with \n\n; data: lines are what we want
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) yield delta;
      } catch {
        /* ignore malformed chunk */
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Tools — function definitions the LLM can call.                      */
/* ------------------------------------------------------------------ */

export const evaluateTool: DeepSeekTool = {
  type: "function",
  function: {
    name: "evaluate_trade",
    description:
      "Decide whether to BUY, SELL, SHORT, COVER, or REFUSE on a single stock symbol given market data and the agent's constraints.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["buy", "sell", "short", "cover", "refuse"],
          description: "The action to take. 'refuse' means do nothing.",
        },
        qty: {
          type: "number",
          description:
            "Number of shares to trade. Use a fractional position size — never exceed 8% of equity in a single name.",
        },
        confidence: {
          type: "number",
          description: "Your confidence in the action, 0 to 100.",
        },
        threshold: {
          type: "number",
          description: "The minimum confidence required to execute. Default 60.",
        },
        reasoning: {
          type: "string",
          description:
            "One or two sentences explaining the decision in plain English. This is what the user sees in the audit log.",
        },
        sources: {
          type: "array",
          description: "Up to 4 short source citations that informed the decision.",
          items: {
            type: "object",
            properties: {
              tag: {
                type: "string",
                description:
                  "Short label like 'REUTERS', 'SEC 10-Q', 'TECHNICAL', 'MACRO'.",
              },
              text: { type: "string", description: "The relevant fact." },
            },
          },
        },
      },
      required: ["action", "confidence", "reasoning", "sources"],
    },
  },
};

export const agentTools: DeepSeekTool[] = [evaluateTool];

/* ------------------------------------------------------------------ */
/*  Chat tool — used by the /app/chat page                              */
/* ------------------------------------------------------------------ */

// The chat model can either:
//   - return plain assistant text answering the user, OR
//   - call propose_trade to surface a *proposal* card for the user
//     to confirm. It never executes trades directly.
export const proposeTradeTool: DeepSeekTool = {
  type: "function",
  function: {
    name: "propose_trade",
    description:
      "Propose a paper trade for the user to confirm. Use ONLY when the user explicitly asks you to consider buying/selling/shorting/covering a specific symbol. Do not propose proactively. The user must always confirm.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol, uppercase." },
        action: {
          type: "string",
          enum: ["buy", "sell", "short", "cover"],
          description: "The proposed action.",
        },
        qty: {
          type: "number",
          description: "Number of shares proposed. Keep ≤ 8% of equity in this name.",
        },
        confidence: {
          type: "number",
          description: "Your confidence in the action, 0 to 100.",
        },
        reasoning: {
          type: "string",
          description: "Plain-English explanation of why this trade makes sense.",
        },
        sources: {
          type: "array",
          description: "Up to 4 short source citations.",
          items: {
            type: "object",
            properties: {
              tag: { type: "string" },
              text: { type: "string" },
            },
          },
        },
      },
      required: ["symbol", "action", "qty", "confidence", "reasoning", "sources"],
    },
  },
};

export const createPlanTool: DeepSeekTool = {
  type: "function",
  function: {
    name: "create_plan",
    description:
      "Open a long-running plan when the user asks for one, or when the agent identifies a thesis worth committing to (range-bound name, watchlist expansion, earnings hedge, etc.). The plan shows up on the user's /app/goals page and tracks progress over time.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short, plain-English title. e.g. 'NVDA breakout above $500'",
        },
        thesis: {
          type: "string",
          description:
            "One-paragraph explanation of the plan. Plain English, no jargon.",
        },
        symbols: {
          type: "array",
          items: { type: "string" },
          description: "Tickers the plan applies to. Empty array is fine.",
        },
      },
      required: ["title", "thesis"],
    },
  },
};

export const proposeOptionsStrategyTool: DeepSeekTool = {
  type: "function",
  function: {
    name: "propose_options_strategy",
    description:
      "Compose a multi-leg options strategy (covered call, protective put, bull call spread, bear put spread). Returns the exact OCC option symbols + sides to trade. The strategy is sent to the user for sign-off via the queue — nothing is placed directly.",
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["covered_call", "protective_put", "bull_call_spread", "bear_put_spread"],
          description: "The strategy to compose.",
        },
        underlying: {
          type: "string",
          description: "Ticker symbol, e.g. AAPL.",
        },
        qty: {
          type: "number",
          description: "Number of contracts (each contract = 100 shares for standard equity options).",
        },
        expiry: {
          type: "string",
          description: "Expiration date in YYYY-MM-DD format.",
        },
        strike_offset_pct: {
          type: "number",
          description: "For covered_call/protective_put: how far OTM (positive = above spot for calls, below for puts). 2-5% typical.",
        },
        long_strike_offset_pct: {
          type: "number",
          description: "Bull/bear spreads: offset of the long leg from spot.",
        },
        short_strike_offset_pct: {
          type: "number",
          description: "Bull/bear spreads: offset of the short leg from spot (further OTM than long).",
        },
        reasoning: {
          type: "string",
          description: "Plain-English thesis for why this strategy fits now.",
        },
      },
      required: ["kind", "underlying", "qty", "expiry", "reasoning"],
    },
  },
};

export const chatTools: DeepSeekTool[] = [proposeTradeTool, createPlanTool, proposeOptionsStrategyTool];
