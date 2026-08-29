#!/usr/bin/env node
/**
 * Vermilion — Alpaca MCP Server
 * ------------------------------
 * Speaks JSON-RPC 2.0 over stdio (the MCP transport) and exposes a
 * comprehensive surface of the Alpaca paper-trading + market data
 * APIs as MCP `tools`. This lets any MCP-compatible host (Claude
 * Desktop, Cursor, ChatGPT, OpenCode, etc.) drive the same broker
 * the Vermilion web app uses.
 *
 * Configure with the same env vars as the Next.js app:
 *   APCA_API_KEY_ID, APCA_API_SECRET_KEY
 *   APCA_PAPER_BASE_URL (optional, defaults to paper-api.alpaca.markets)
 *   APCA_DATA_BASE_URL  (optional, defaults to data.alpaca.markets)
 *
 * Run standalone:
 *   node mcp/alpaca-mcp/server.mjs
 * Or via the root script:
 *   npm run mcp
 * Or via npx after install:
 *   npx -y vermilion-alpaca-mcp
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Minimal .env loader (no extra dep). Reads KEY=VALUE lines, ignores
 * comments and blanks, expands them into process.env. We avoid
 * `dotenv` because v17 prints an instructional tip to stdout by
 * default, which would corrupt the JSON-RPC stream this server emits.
 */
function loadEnv() {
  for (const candidate of [
    resolve(__dirname, "../../.env.local"),
    resolve(__dirname, "../../.env"),
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), ".env"),
  ]) {
    if (!existsSync(candidate)) continue;
    const text = readFileSync(candidate, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
    break;
  }
}
loadEnv();

const PAPER = process.env.APCA_PAPER_BASE_URL || "https://paper-api.alpaca.markets";
const DATA = process.env.APCA_DATA_BASE_URL || "https://data.alpaca.markets";
const KEY = process.env.APCA_API_KEY_ID || "";
const SECRET = process.env.APCA_API_SECRET_KEY || "";

if (!KEY || !SECRET) {
  // We don't exit — we still serve initialize and tools/list so the
  // host can show a friendly error. tool calls will return a clear message.
  process.stderr.write(
    "[vermilion-alpaca-mcp] WARNING: APCA_API_KEY_ID or APCA_API_SECRET_KEY missing. Tool calls will fail until these are set.\n",
  );
}

// -------- JSON-RPC plumbing --------

const TOOLS = [
  {
    name: "alpaca_get_account",
    description:
      "Return the paper account snapshot — cash, buying power, portfolio value, equity, PDT status, account number, status flags. No parameters.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "alpaca_get_positions",
    description:
      "List all currently-held positions (equities + options). Each row includes symbol, qty, side, avg entry, market value, unrealized P&L. No parameters.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "alpaca_get_open_orders",
    description:
      "List all open (unfilled) orders on the paper account. No parameters.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "alpaca_cancel_order",
    description: "Cancel a single open order by its Alpaca order id.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Alpaca order id" } },
      additionalProperties: false,
    },
  },
  {
    name: "alpaca_get_snapshot",
    description:
      "Get the latest quote, latest trade, minute bar, and daily bar for a single stock symbol.",
    inputSchema: {
      type: "object",
      required: ["symbol"],
      properties: { symbol: { type: "string", description: "Stock symbol, e.g. AAPL" } },
      additionalProperties: false,
    },
  },
  {
    name: "alpaca_get_quotes",
    description:
      "Get the latest top-of-book quotes (bid/ask/size) for one or more stock symbols in a single call.",
    inputSchema: {
      type: "object",
      required: ["symbols"],
      properties: {
        symbols: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 50 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "alpaca_get_news",
    description:
      "Fetch recent Alpaca-curated news headlines for a list of stock symbols. limit default 10, max 50.",
    inputSchema: {
      type: "object",
      required: ["symbols"],
      properties: {
        symbols: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 20 },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "alpaca_get_bars",
    description:
      "Historical OHLCV bars for a stock. timeframe supports: 1Min, 5Min, 15Min, 1Hour, 1Day. start/end are RFC3339 or YYYY-MM-DD.",
    inputSchema: {
      type: "object",
      required: ["symbol", "timeframe"],
      properties: {
        symbol: { type: "string" },
        timeframe: { type: "string", enum: ["1Min", "5Min", "15Min", "1Hour", "1Day"] },
        start: { type: "string" },
        end: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 10000, default: 200 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "alpaca_get_portfolio_history",
    description:
      "Equity curve + P&L for the paper account. timeframe=1D returns per-minute intraday; 1W/1M/1A are daily/weekly. period: integer days.",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["1D", "1W", "1M", "3M", "1A", "all"], default: "1M" },
        timeframe: { type: "string", enum: ["1Min", "5Min", "15Min", "1H", "1D"], default: "1D" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "alpaca_get_clock",
    description:
      "Market clock — current timestamp, whether the market is open, next open/close. No parameters.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "alpaca_get_asset",
    description:
      "Asset metadata for a single stock symbol — name, exchange, tradable, marginable, shortable, easy-to-borrow.",
    inputSchema: {
      type: "object",
      required: ["symbol"],
      properties: { symbol: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "alpaca_place_order",
    description:
      "Place an equity order on the paper account. Supports market and limit, day and gtc. Returns the full order object including id, status, and fill price (if filled).",
    inputSchema: {
      type: "object",
      required: ["symbol", "qty", "side"],
      properties: {
        symbol: { type: "string" },
        qty: { type: "number", minimum: 0 },
        side: { type: "enum", enum: ["buy", "sell"] },
        type: { type: "enum", enum: ["market", "limit"], default: "market" },
        time_in_force: { type: "enum", enum: ["day", "gtc", "opg", "cls", "ioc", "fok"], default: "day" },
        limit_price: { type: "number" },
        client_order_id: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  // --- options ---
  {
    name: "alpaca_get_option_expirations",
    description:
      "List the next monthly option expirations for an underlying symbol. Sorted ascending.",
    inputSchema: {
      type: "object",
      required: ["underlying"],
      properties: { underlying: { type: "string", description: "Stock symbol, e.g. AAPL" } },
      additionalProperties: false,
    },
  },
  {
    name: "alpaca_get_option_chain",
    description:
      "Fetch the live option chain for an underlying. Optional filters: expiration date (YYYY-MM-DD), type (call|put), limit.",
    inputSchema: {
      type: "object",
      required: ["underlying"],
      properties: {
        underlying: { type: "string" },
        expiration: { type: "string", description: "YYYY-MM-DD" },
        type: { type: "enum", enum: ["call", "put"] },
        limit: { type: "integer", minimum: 1, maximum: 1000, default: 200 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "alpaca_get_option_snapshots",
    description:
      "Live quotes + greeks + IV for a list of OCC option symbols (e.g. AAPL240621C00200000).",
    inputSchema: {
      type: "object",
      required: ["symbols"],
      properties: {
        symbols: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 50 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "alpaca_place_option_order",
    description:
      "Place an options order. symbol must be the OCC option symbol (e.g. AAPL240621C00200000). Returns the full order object.",
    inputSchema: {
      type: "object",
      required: ["symbol", "qty", "side"],
      properties: {
        symbol: { type: "string", description: "OCC option symbol" },
        qty: { type: "number", minimum: 0 },
        side: { type: "enum", enum: ["buy", "sell"] },
        type: { type: "enum", enum: ["market", "limit"], default: "limit" },
        time_in_force: { type: "enum", enum: ["day", "gtc"], default: "day" },
        limit_price: { type: "number" },
        client_order_id: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "alpaca_compose_strategy",
    description:
      "Compose a multi-leg options strategy from the live chain. Returns the exact OCC symbols + sides + qty the agent should send. Strategies: covered_call, protective_put, bull_call_spread, bear_put_spread.",
    inputSchema: {
      type: "object",
      required: ["kind", "underlying", "qty", "expiry"],
      properties: {
        kind: { type: "enum", enum: ["covered_call", "protective_put", "bull_call_spread", "bear_put_spread"] },
        underlying: { type: "string" },
        qty: { type: "integer", minimum: 1 },
        expiry: { type: "string", description: "YYYY-MM-DD" },
        strike_offset_pct: { type: "number", description: "Single-leg strategies only" },
        long_strike_offset_pct: { type: "number", description: "Vertical spreads only — long leg" },
        short_strike_offset_pct: { type: "number", description: "Vertical spreads only — short leg" },
      },
      additionalProperties: false,
    },
  },
];

// -------- HTTP --------

async function call({ url, method = "GET", body }) {
  if (!KEY || !SECRET) {
    throw new Error(
      "Alpaca keys not configured. Set APCA_API_KEY_ID and APCA_API_SECRET_KEY in .env.local before calling any tool.",
    );
  }
  // Re-read keys from process.env on every call so they are always live.
  const k = process.env.APCA_API_KEY_ID || KEY;
  const s = process.env.APCA_API_SECRET_KEY || SECRET;
  const res = await fetch(url, {
    method,
    headers: {
      "APCA-API-KEY-ID": k,
      "APCA-API-SECRET-KEY": s,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = text;
    try {
      msg = JSON.parse(text).message ?? text;
    } catch {}
    throw new Error(`Alpaca ${method} ${url} -> ${res.status}: ${msg || res.statusText}`);
  }
  if (res.status === 204) return { ok: true };
  return res.json();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const TOOL_HANDLERS = {
  alpaca_get_account: async () => call({ url: `${PAPER}/v2/account` }),

  alpaca_get_positions: async () => call({ url: `${PAPER}/v2/positions` }),

  alpaca_get_open_orders: async () => call({ url: `${PAPER}/v2/orders?status=open` }),

  alpaca_cancel_order: async ({ id }) => call({ url: `${PAPER}/v2/orders/${encodeURIComponent(id)}`, method: "DELETE" }),

  alpaca_get_snapshot: async ({ symbol }) =>
    call({ url: `${DATA}/v2/stocks/${encodeURIComponent(symbol)}/snapshot` }),

  alpaca_get_quotes: async ({ symbols }) =>
    call({
      url: `${DATA}/v2/stocks/quotes/latest?symbols=${encodeURIComponent(symbols.join(","))}`,
    }),

  alpaca_get_news: async ({ symbols, limit = 10 }) =>
    call({
      url: `${DATA}/v1beta1/news?symbols=${encodeURIComponent(symbols.join(","))}&limit=${limit}`,
    }),

  alpaca_get_bars: async ({ symbol, timeframe, start, end, limit = 200 }) => {
    const params = new URLSearchParams({ timeframe, limit: String(limit) });
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    return call({ url: `${DATA}/v2/stocks/${encodeURIComponent(symbol)}/bars?${params}` });
  },

  alpaca_get_portfolio_history: async ({ period = "1M", timeframe = "1D" } = {}) =>
    call({
      url: `${PAPER}/v2/account/portfolio/history?period=${period}&timeframe=${timeframe}`,
    }),

  alpaca_get_clock: async () => call({ url: `${PAPER}/v2/clock` }),

  alpaca_get_asset: async ({ symbol }) => call({ url: `${PAPER}/v2/assets/${encodeURIComponent(symbol)}` }),

  alpaca_place_order: async (req) => {
    const body = {
      symbol: req.symbol,
      qty: req.qty,
      side: req.side,
      type: req.type ?? "market",
      time_in_force: req.time_in_force ?? "day",
    };
    if (req.limit_price != null) body.limit_price = req.limit_price;
    if (req.client_order_id) body.client_order_id = req.client_order_id;
    return call({ url: `${PAPER}/v2/orders`, method: "POST", body });
  },

  alpaca_get_option_expirations: async ({ underlying }) => {
    const r = await call({
      url: `${DATA}/v1beta1/options/contracts?underlying_symbols=${encodeURIComponent(underlying)}&status=active&limit=100`,
    });
    const seen = new Set();
    for (const c of r.option_contracts ?? []) seen.add(c.expiration_date);
    return Array.from(seen).sort();
  },

  alpaca_get_option_chain: async ({ underlying, expiration, type, limit = 200 }) => {
    const params = new URLSearchParams({
      underlying_symbols: underlying,
      status: "active",
      limit: String(limit),
    });
    if (expiration) params.set("expiration_date", expiration);
    if (type) params.set("type", type);
    const r = await call({ url: `${DATA}/v1beta1/options/contracts?${params}` });
    return r.option_contracts ?? [];
  },

  alpaca_get_option_snapshots: async ({ symbols }) => {
    if (!symbols || symbols.length === 0) return {};
    const params = new URLSearchParams();
    for (const s of symbols) params.append("symbols", s);
    return call({ url: `${DATA}/v1beta1/options/snapshots?${params}` });
  },

  alpaca_place_option_order: async (req) => {
    const body = {
      symbol: req.symbol,
      qty: req.qty,
      side: req.side,
      type: req.type ?? "limit",
      time_in_force: req.time_in_force ?? "day",
    };
    if (req.limit_price != null) body.limit_price = req.limit_price;
    if (req.client_order_id) body.client_order_id = req.client_order_id;
    return call({ url: `${PAPER}/v2/orders`, method: "POST", body });
  },

  alpaca_compose_strategy: async (strat) => {
    const chain = await TOOL_HANDLERS.alpaca_get_option_chain({
      underlying: strat.underlying,
      expiration: strat.expiry,
    });
    const calls = chain.filter((c) => c.type === "call");
    const puts = chain.filter((c) => c.type === "put");
    const snap = await TOOL_HANDLERS.alpaca_get_snapshot({ symbol: strat.underlying }).catch(() => null);
    const last = num(snap?.dailyBar?.c) ?? num(snap?.latestTrade?.p);
    if (!last) return { legs: [], notes: "underlying price unavailable" };

    const pick = (arr, target) =>
      arr
        .map((c) => ({ c, d: Math.abs(num(c.strike_price) - target) }))
        .sort((a, b) => a.d - b.d)[0]?.c;

    if (strat.kind === "covered_call") {
      const target = last * (1 + (strat.strike_offset_pct ?? 3) / 100);
      const call = pick(calls, target);
      if (!call) return { legs: [], notes: "no suitable call strike" };
      return {
        legs: [{ symbol: call.symbol, qty: strat.qty, side: "sell", type: "limit", time_in_force: "day" }],
        notes: `Sell ${strat.qty} ${call.symbol} ($${call.strike_price}C ${call.expiration_date}). Caps upside; collects premium.`,
      };
    }
    if (strat.kind === "protective_put") {
      const target = last * (1 - (strat.strike_offset_pct ?? 3) / 100);
      const put = pick(puts, target);
      if (!put) return { legs: [], notes: "no suitable put strike" };
      return {
        legs: [{ symbol: put.symbol, qty: strat.qty, side: "buy", type: "limit", time_in_force: "day" }],
        notes: `Buy ${strat.qty} ${put.symbol} ($${put.strike_price}P ${put.expiration_date}). Floors loss.`,
      };
    }
    if (strat.kind === "bull_call_spread") {
      const longTarget = last * (1 + (strat.long_strike_offset_pct ?? 2) / 100);
      const shortTarget = last * (1 + (strat.short_strike_offset_pct ?? 6) / 100);
      const longCall = pick(calls, longTarget);
      const shortCall = pick(
        calls.filter((c) => num(c.strike_price) > num(longCall?.strike_price)),
        shortTarget,
      );
      if (!longCall || !shortCall) return { legs: [], notes: "could not pick both legs" };
      return {
        legs: [
          { symbol: longCall.symbol, qty: strat.qty, side: "buy", type: "limit", time_in_force: "day" },
          { symbol: shortCall.symbol, qty: strat.qty, side: "sell", type: "limit", time_in_force: "day" },
        ],
        notes: `Bull call spread: long $${longCall.strike_price}C / short $${shortCall.strike_price}C, exp ${longCall.expiration_date}.`,
      };
    }
    // bear_put_spread
    const longTarget = last * (1 - (strat.long_strike_offset_pct ?? 2) / 100);
    const shortTarget = last * (1 - (strat.short_strike_offset_pct ?? 6) / 100);
    const longPut = pick(puts, longTarget);
    const shortPut = pick(
      puts.filter((p) => num(p.strike_price) < num(longPut?.strike_price)),
      shortTarget,
    );
    if (!longPut || !shortPut) return { legs: [], notes: "could not pick both legs" };
    return {
      legs: [
        { symbol: longPut.symbol, qty: strat.qty, side: "buy", type: "limit", time_in_force: "day" },
        { symbol: shortPut.symbol, qty: strat.qty, side: "sell", type: "limit", time_in_force: "day" },
      ],
      notes: `Bear put spread: long $${longPut.strike_price}P / short $${shortPut.strike_price}P, exp ${longPut.expiration_date}.`,
    };
  },
};

// -------- MCP server core --------

const SERVER_INFO = {
  name: "vermilion-alpaca-mcp",
  version: "0.1.0",
};
const SERVER_CAPS = { tools: {} };

function frame(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function frameErr(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleMessage(msg) {
  const { id, method, params } = msg;
  try {
    switch (method) {
      case "initialize":
        return frame(id, {
          protocolVersion: params?.protocolVersion ?? "2024-11-05",
          serverInfo: SERVER_INFO,
          capabilities: SERVER_CAPS,
        });
      case "notifications/initialized":
        // No-op; per spec, no response.
        return null;
      case "ping":
        return frame(id, {});
      case "tools/list":
        return frame(id, { tools: TOOLS });
      case "tools/call": {
        const { name, arguments: args = {} } = params ?? {};
        const fn = TOOL_HANDLERS[name];
        if (!fn) {
          return frame(id, {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          });
        }
        const out = await fn(args);
        return frame(id, {
          content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        });
      }
      default:
        return frameErr(id, -32601, `Method not implemented: ${method}`);
    }
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    if (id !== undefined) return frameErr(id, -32000, message);
    process.stderr.write(`[vermilion-alpaca-mcp] error: ${message}\n`);
    return null;
  }
}

// -------- stdin/stdout reader (newline-delimited JSON-RPC) --------

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (e) {
      process.stderr.write(`[vermilion-alpaca-mcp] malformed JSON: ${e.message}\n`);
      continue;
    }
    try {
      const out = await handleMessage(msg);
      if (out !== null) {
        process.stdout.write(JSON.stringify(out) + "\n");
      }
    } catch (e) {
      process.stderr.write(`[vermilion-alpaca-mcp] handler crash: ${e.stack || e.message}\n`);
    }
  }
});
process.stdin.on("end", () => process.exit(0));
process.stderr.write(`[vermilion-alpaca-mcp] listening on stdio — tools: ${TOOLS.length}\n`);
