import "server-only";

/**
 * Server-side Alpaca wrapper. Reads keys from env, calls the paper
 * trading + market data APIs. Never imported from a Client Component.
 */

const BASE = process.env.APCA_PAPER_BASE_URL || "https://paper-api.alpaca.markets";
const DATA = process.env.APCA_DATA_BASE_URL || "https://data.alpaca.markets";
const KEY = process.env.APCA_API_KEY_ID || "";
const SECRET = process.env.APCA_API_SECRET_KEY || "";

type AlpacaError = { message: string; code?: number };

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  if (!KEY || !SECRET) {
    throw new Error(
      "Alpaca keys not configured. Add APCA_API_KEY_ID and APCA_API_SECRET_KEY to .env.local.",
    );
  }
  const res = await fetch(url, {
    ...init,
    headers: {
      "APCA-API-KEY-ID": KEY,
      "APCA-API-SECRET-KEY": SECRET,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as AlpacaError;
    throw new Error(
      `Alpaca ${init.method ?? "GET"} ${url} -> ${res.status} ${body.message ?? res.statusText}`,
    );
  }
  // 204 No Content
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type AlpacaAccount = {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  cash: string;
  portfolio_value: string;
  equity: string;
  buying_power: string;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  transfers_blocked: boolean;
  account_blocked: boolean;
  created_at: string;
  shorting_enabled: boolean;
  long_market_value: string;
  short_market_value: string;
  initial_margin: string;
  maintenance_margin: string;
};

export type AlpacaPosition = {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: string;
  qty: string;
  avg_entry_price: string;
  side: "long" | "short";
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  current_price: string;
  change_today: string;
};

export type AlpacaOrder = {
  id: string;
  client_order_id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at: string | null;
  asset_id: string;
  symbol: string;
  asset_class: string;
  qty: string;
  filled_qty: string;
  filled_avg_price: string | null;
  order_class: string;
  type: "market" | "limit" | "stop" | "stop_limit" | "trailing_stop";
  side: "buy" | "sell";
  time_in_force: "day" | "gtc" | "opg" | "cls" | "ioc" | "fok";
  limit_price: string | null;
  stop_price: string | null;
  status:
    | "new"
    | "partially_filled"
    | "filled"
    | "done_for_day"
    | "canceled"
    | "expired"
    | "rejected"
    | "pending_cancel"
    | "pending_replace"
    | "accepted"
    | "pending_new"
    | "accepted_for_bidding"
    | "stopped"
    | "suspended"
    | "calculated";
};

export type AlpacaQuote = {
  symbol: string;
  name?: string;
  exchange: string;
  asset_class: string;
  status: string;
  tradable: boolean;
  marginable: boolean;
  shortable: boolean;
  easy_to_borrow: boolean;
  quote: {
    ap: number;
    as: number;
    bp: number;
    bs: number;
    t: string;
  };
  previousClose?: number;
  updated_at?: string;
};

// -------- Account & positions --------

export function getAccount(): Promise<AlpacaAccount> {
  return call<AlpacaAccount>(`${BASE}/v2/account`);
}

export function getPositions(): Promise<AlpacaPosition[]> {
  return call<AlpacaPosition[]>(`${BASE}/v2/positions`);
}

export function getOpenOrders(): Promise<AlpacaOrder[]> {
  return call<AlpacaOrder[]>(`${BASE}/v2/orders?status=open`);
}

// -------- Market data --------

export function getQuotes(symbols: string[]): Promise<Record<string, AlpacaQuote>> {
  if (symbols.length === 0) return Promise.resolve({});
  return call<Record<string, AlpacaQuote>>(
    `${DATA}/v2/stocks/quotes/latest?symbols=${encodeURIComponent(symbols.join(","))}`,
  );
}

export function getSnapshot(symbol: string): Promise<{
  latestTrade?: { p: number; t: string };
  latestQuote?: AlpacaQuote["quote"];
  minuteBar?: { c: number; o: number; h: number; l: number; v: number; t: string };
  dailyBar?: { c: number; o: number; h: number; l: number; v: number; t: string };
  prevDailyBar?: { c: number; o: number; h: number; l: number; v: number; t: string };
}> {
  return call(`${DATA}/v2/stocks/${encodeURIComponent(symbol)}/snapshot`);
}

// -------- Orders --------

export type OrderRequest = {
  symbol: string;
  qty: number;
  side: "buy" | "sell";
  type?: "market" | "limit";
  time_in_force?: "day" | "gtc";
  limit_price?: number;
  client_order_id?: string;
};

export function placeOrder(req: OrderRequest): Promise<AlpacaOrder> {
  return call<AlpacaOrder>(`${BASE}/v2/orders`, {
    method: "POST",
    body: JSON.stringify({
      symbol: req.symbol,
      qty: req.qty,
      side: req.side,
      type: req.type ?? "market",
      time_in_force: req.time_in_force ?? "day",
      ...(req.limit_price ? { limit_price: req.limit_price } : {}),
      ...(req.client_order_id ? { client_order_id: req.client_order_id } : {}),
    }),
  });
}

// -------- Options --------

/**
 * Raw option contract as returned by the Alpaca options API.
 * Symbol format: AAPL240621C00200000 = AAPL 2024-06-21 $200 Call.
 */
export type OptionContract = {
  id: string;
  symbol: string;            // OCC option symbol
  name: string;
  status: "active" | "inactive" | "expired";
  root_symbol: string;       // e.g. AAPL
  underlying_symbol: string; // e.g. AAPL
  underlying_asset_symbol: string;
  strike_price: string;
  expiration_date: string;    // YYYY-MM-DD
  style: "american" | " european";
  type: "call" | "put";
  size: string;              // 100 = standard
  open_interest?: string;
  close_price?: string;
  tradeable: boolean;
};

export type OptionSnapshot = {
  symbol: string;
  latestQuote?: { ap: number; as: number; bp: number; bs: number; t: string };
  latestTrade?: { p: number; s: number; t: string };
  greeks?: { delta: number; gamma: number; theta: number; vega: number; rho: number };
  impliedVolatility?: number;
};

export type OptionOrderRequest = {
  /** OCC option symbol, e.g. AAPL240621C00200000 */
  symbol: string;
  qty: number;
  side: "buy" | "sell";
  type?: "market" | "limit";
  time_in_force?: "day" | "gtc";
  limit_price?: number;
  client_order_id?: string;
};

export type OptionStrategy =
  | { kind: "covered_call"; underlying: string; qty: number; expiry: string; strike_offset_pct: number }
  | { kind: "protective_put"; underlying: string; qty: number; expiry: string; strike_offset_pct: number }
  | { kind: "bull_call_spread"; underlying: string; qty: number; expiry: string; long_strike_offset_pct: number; short_strike_offset_pct: number }
  | { kind: "bear_put_spread"; underlying: string; qty: number; expiry: string; long_strike_offset_pct: number; short_strike_offset_pct: number };

/**
 * Fetch the option chain for one or more underlying symbols.
 * Returns active (non-expired) contracts by default.
 */
export async function getOptionChain(
  underlying: string,
  opts: { expiration?: string; type?: "call" | "put"; limit?: number } = {},
): Promise<OptionContract[]> {
  const params = new URLSearchParams({ underlying_symbols: underlying, status: "active" });
  if (opts.expiration) params.set("expiration_date", opts.expiration);
  if (opts.type) params.set("type", opts.type);
  if (opts.limit) params.set("limit", String(opts.limit));
  const r = await call<{ option_contracts: OptionContract[] }>(
    `${DATA}/v1beta1/options/contracts?${params}`,
  );
  return r.option_contracts ?? [];
}

/** Fetch live quotes + greeks for one or more option symbols. */
export async function getOptionSnapshots(
  symbols: string[],
): Promise<Record<string, OptionSnapshot>> {
  if (symbols.length === 0) return {};
  const params = new URLSearchParams();
  for (const s of symbols) params.append("symbols", s);
  return call<Record<string, OptionSnapshot>>(
    `${DATA}/v1beta1/options/snapshots?${params}`,
  );
}

/** Get the next ~6 monthly expirations for an underlying. */
export async function getOptionExpirations(underlying: string): Promise<string[]> {
  const params = new URLSearchParams({ underlying_symbols: underlying, status: "active", limit: "100" });
  const r = await call<{ option_contracts: OptionContract[] }>(
    `${DATA}/v1beta1/options/contracts?${params}`,
  );
  const seen = new Set<string>();
  for (const c of r.option_contracts ?? []) seen.add(c.expiration_date);
  return Array.from(seen).sort();
}

/**
 * Place an options order. Same shape as `placeOrder` but with the
 * `asset_class: "us_option"` set and the OCC symbol in `symbol`.
 */
export function placeOptionOrder(req: OptionOrderRequest): Promise<AlpacaOrder> {
  return call<AlpacaOrder>(`${BASE}/v2/orders`, {
    method: "POST",
    body: JSON.stringify({
      symbol: req.symbol,
      qty: req.qty,
      side: req.side,
      type: req.type ?? "market",
      time_in_force: req.time_in_force ?? "day",
      ...(req.limit_price ? { limit_price: req.limit_price } : {}),
      ...(req.client_order_id ? { client_order_id: req.client_order_id } : {}),
    }),
  });
}

/**
 * Get currently-held options positions. Used to compute "is the
 * covered-call thesis still armed?" before deciding whether to roll.
 */
export type OptionPosition = {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: "us_option";
  qty: string;
  side: "long" | "short";
  avg_entry_price: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  current_price: string;
  change_today: string;
  type: "call" | "put";
  strike_price: string;
  expiration_date: string;
};

/**
 * Strategy composer: given a high-level intent + the live option
 * chain, return the legs we'd actually submit. Returns the order
 * requests for the agent to send to the queue.
 */
export async function composeStrategy(
  strat: OptionStrategy,
): Promise<{ legs: OptionOrderRequest[]; underlying_action?: "buy" | "sell" | "hold"; notes: string }> {
  const chain = await getOptionChain(strat.underlying, { expiration: strat.expiry });
  const calls = chain.filter((c) => c.type === "call");
  const puts = chain.filter((c) => c.type === "put");
  const lastClose = Number(
    (await getSnapshot(strat.underlying).catch(() => null))?.dailyBar?.c ?? 0,
  );
  if (!lastClose) {
    return { legs: [], notes: "underlying price unavailable" };
  }

  const pickByStrike = (contracts: OptionContract[], target: number) =>
    contracts
      .map((c) => ({ c, dist: Math.abs(Number(c.strike_price) - target) }))
      .sort((a, b) => a.dist - b.dist)[0]?.c;

  if (strat.kind === "covered_call") {
    const target = lastClose * (1 + strat.strike_offset_pct / 100);
    const call = pickByStrike(calls, target);
    if (!call) return { legs: [], notes: "no suitable call strike" };
    return {
      legs: [{ symbol: call.symbol, qty: strat.qty, side: "sell", type: "limit", limit_price: Number(call.close_price ?? 1).toFixed(2) ? undefined : undefined, time_in_force: "day" }],
      notes: `Sell 1 call per 100 shares of ${strat.underlying}, strike $${call.strike_price}, expiry ${call.expiration_date}. Caps upside at strike; collects premium.`,
    };
  }

  if (strat.kind === "protective_put") {
    const target = lastClose * (1 - strat.strike_offset_pct / 100);
    const put = pickByStrike(puts, target);
    if (!put) return { legs: [], notes: "no suitable put strike" };
    return {
      legs: [{ symbol: put.symbol, qty: strat.qty, side: "buy", type: "limit", time_in_force: "day" }],
      notes: `Buy 1 put per 100 shares of ${strat.underlying}, strike $${put.strike_price}, expiry ${put.expiration_date}. Floors the loss at strike.`,
    };
  }

  if (strat.kind === "bull_call_spread") {
    const longTarget = lastClose * (1 + strat.long_strike_offset_pct / 100);
    const shortTarget = lastClose * (1 + strat.short_strike_offset_pct / 100);
    const longCall = pickByStrike(calls, longTarget);
    const shortCall = pickByStrike(calls.filter((c) => Number(c.strike_price) > Number(longCall?.strike_price ?? 0)), shortTarget);
    if (!longCall || !shortCall) return { legs: [], notes: "could not pick both legs" };
    return {
      legs: [
        { symbol: longCall.symbol, qty: strat.qty, side: "buy", type: "limit", time_in_force: "day" },
        { symbol: shortCall.symbol, qty: strat.qty, side: "sell", type: "limit", time_in_force: "day" },
      ],
      notes: `Bull call spread: long $${longCall.strike_price} call, short $${shortCall.strike_price} call, both expiring ${longCall.expiration_date}. Defined risk; max profit at short strike.`,
    };
  }

  // bear_put_spread
  const longTarget = lastClose * (1 - strat.long_strike_offset_pct / 100);
  const shortTarget = lastClose * (1 - strat.short_strike_offset_pct / 100);
  const longPut = pickByStrike(puts, longTarget);
  const shortPut = pickByStrike(puts.filter((p) => Number(p.strike_price) < Number(longPut?.strike_price ?? 0)), shortTarget);
  if (!longPut || !shortPut) return { legs: [], notes: "could not pick both legs" };
  return {
    legs: [
      { symbol: longPut.symbol, qty: strat.qty, side: "buy", type: "limit", time_in_force: "day" },
      { symbol: shortPut.symbol, qty: strat.qty, side: "sell", type: "limit", time_in_force: "day" },
    ],
    notes: `Bear put spread: long $${longPut.strike_price} put, short $${shortPut.strike_price} put, both expiring ${longPut.expiration_date}. Profits if underlying drops below long strike.`,
  };
}

export function cancelOrder(id: string): Promise<void> {
  return call<void>(`${BASE}/v2/orders/${id}`, { method: "DELETE" });
}

// -------- Clock --------

export function getClock(): Promise<{
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string;
}> {
  return call(`${BASE}/v2/clock`);
}

// -------- Convenience helpers --------

export async function isMarketOpen(): Promise<boolean> {
  try {
    const c = await getClock();
    return c.is_open;
  } catch {
    return false;
  }
}

export async function getAccountSummary(): Promise<{
  cash: number;
  equity: number;
  buying_power: number;
  portfolio_value: number;
  status: string;
  shorting_enabled: boolean;
  day_trading_buying_power: number;
}> {
  const a = await getAccount();
  return {
    cash: Number(a.cash),
    equity: Number(a.equity),
    buying_power: Number(a.buying_power),
    portfolio_value: Number(a.portfolio_value),
    status: a.status,
    shorting_enabled: a.shorting_enabled,
    day_trading_buying_power: Number(a.buying_power),
  };
}

// -------- Bars (historical) --------
// For the per-stock detail chart. 1D, 5D, 1M, 3M, 1Y.
export type Timeframe = "1Min" | "5Min" | "15Min" | "1Hour" | "1Day";
export type Bar = { t: string; o: number; h: number; l: number; c: number; v: number };

export function getBars(
  symbol: string,
  timeframe: Timeframe,
  start: string,
  end: string,
  limit = 1000,
): Promise<{ bars: Bar[] }> {
  const params = new URLSearchParams({
    timeframe,
    start,
    end,
    limit: String(limit),
    adjustment: "raw",
  });
  return call(`${DATA}/v2/stocks/${encodeURIComponent(symbol)}/bars?${params}`);
}

// -------- News (Alpaca news) --------
export type NewsItem = {
  id: number;
  headline: string;
  summary: string;
  author: string;
  source: string;
  url: string;
  symbols: string[];
  created_at: string;
  updated_at: string;
};

export function getNews(symbols: string[], limit = 10): Promise<{ news: NewsItem[] }> {
  const params = new URLSearchParams({ limit: String(limit) });
  symbols.forEach((s) => params.append("symbols", s));
  return call(`${DATA}/v1beta1/news?${params}`);
}

// -------- Asset profile (fundamentals) --------
export type Asset = {
  id: string;
  symbol: string;
  name: string;
  exchange: string;
  asset_class: string;
  status: string;
  tradable: boolean;
  marginable: boolean;
  shortable: boolean;
  easy_to_borrow: boolean;
};

export function getAsset(symbol: string): Promise<Asset> {
  return call(`${BASE}/v2/assets/${encodeURIComponent(symbol)}`);
}

// -------- Portfolio history (for the equity curve) --------
//
// Alpaca's paper-trading API exposes /v2/account/portfolio/history which
// returns an equity time series. Useful for showing the user a real
// 14-day curve rather than a fake sine wave. Paper accounts have a
// 30-day lookback max.
export type PortfolioHistoryPoint = {
  timestamp: number; // unix seconds
  equity: number;    // dollars
  profit_loss: number;
  profit_loss_pct: number;
};
export type PortfolioHistory = {
  timestamp: number[];
  equity: number[];
  profit_loss: number[];
  profit_loss_pct: number[];
  base_value: number;
  timeframe: string;
};
export async function getPortfolioHistory(
  period = "2W",
  timeframe = "1D",
): Promise<PortfolioHistory | null> {
  const params = new URLSearchParams({ period, timeframe });
  try {
    return await call<PortfolioHistory>(
      `${BASE}/v2/account/portfolio/history?${params}`,
    );
  } catch {
    return null;
  }
}
