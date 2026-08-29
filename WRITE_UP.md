# Vermilion — One-Page Write-up

**Team:** Vermilion (solo — Prasanna)
**Hackathon:** Alpaca AI Trading Agents Hackathon · lablab.ai · 28 Aug – 4 Sept 2026
**Stack:** Next.js 16 · React 19 · TypeScript · Supabase · DeepSeek · Tailwind v4 · Alpaca Trading + Market Data APIs · MCP (Model Context Protocol)

---

## 1. What Vermilion is

Vermilion is a **self-auditing AI trading agent** that runs end-to-end on
Alpaca's paper-trading infrastructure. It does three things that no
other hackathon entry does together:

1. **Autonomously proposes and (with your sign-off) executes** US equity
   and **options** trades on a $100k Alpaca paper account, using
   DeepSeek as the decision model.
2. **Keeps a human in the loop** by pushing every trade intent to
   Telegram / WhatsApp / Apple Business Chat / Email — where the user
   can approve, decline, or reply with a comment from the same channel
   they were notified on.
3. **Exposes the same broker to any other MCP-compatible agent** (Claude
   Desktop, Cursor, ChatGPT, etc.) via a stand-alone Alpaca MCP server
   so Vermilion's runtime *is* the broker, not just a UI.

The pitch to judges is **"refuse by default, ask by exception"** — the
agent logs a *refusal* (with a reason and a live quote) for every
candidate trade it rejects, plus a *plan* and *reflection* for every
session. The result is a fully traceable P&L audit trail, not a black
box.

---

## 2. AI logic

### 2.1 Decision loop

Each tick of the agent loop (cron / wake-on-visit / chat-triggered):

1. `lib/agent/autonomy.ts#maybeRunCycle` reads the user's
   `user_goals` row (target P&L, max drawdown, autonomy level, watchlist).
2. Pulls live snapshots for the **combined watchlist** (user-added
   symbols ∪ seeded 13-name default list) and a live account summary
   from `lib/alpaca/server.ts`.
3. Pulls the most recent **decisions** and **reflections** for
   context so the model can re-evaluate yesterday's mistakes.
4. Calls `lib/ai/deepseek.ts` with the snapshot bundle and the
   constitution prompt in `lib/agent/constitution.ts`. The model
   returns one of:
   - `propose_trade` with a structured `OrderRequest` (symbol, side,
     qty, type, time_in_force, limit_price),
   - `propose_options_strategy` with a `composeStrategy` payload
     (covered_call, protective_put, bull_call_spread,
     bear_put_spread),
   - `create_plan` (no fill, just a written thesis),
   - `refuse` (no action, with a `reason` field).

The model call is `deepseek-chat` (default) with `deepseek-reasoner`
available for high-stakes sessions.

### 2.2 Refusal-by-default gates

Before any order hits Alpaca it has to clear **four** hard gates
in `lib/agent/autonomy.ts`:

- **Live-quote sanity** — refuse if no snapshot price within 10 min.
- **Market-closed fast-path** — if `isMarketOpen()` returns false and
  the order isn't `gtc`, return a clean refusal with the last close.
- **Per-position cap** — refuse if the proposed notional would push
  the resulting position above `MAX_POSITION_PCT = 8%` of portfolio.
- **Confidence floor** — refuse if the model's confidence is below
  `THRESHOLD = 60`.

The user can dial `THRESHOLD` and `MAX_POSITION_PCT` in
`/app/goals`.

### 2.3 Streaming chat

`/app/chat` is a Perplexity-style workspace (220px sidebar, flex
center, 260px right panel). Two code paths:
- `app/api/chat/stream/route.ts` — SSE streaming for free-form
  questions; `max_tokens=400, temperature=0.2` for snappy replies.
- `app/api/chat/route.ts` — non-streaming when the model
  detects trade intent, with `tool_choice: "required"` and structured
  tool calls (`propose_trade`, `propose_options_strategy`, `create_plan`).

Source citations are only attached when the reply is actually backed
by MCP / audit / news data — no fake sourcing for chit-chat.

---

## 3. Risk gates

| Gate                | Where                                         | Default | What it does                                              |
| ------------------- | --------------------------------------------- | ------- | --------------------------------------------------------- |
| Confidence floor    | `lib/agent/autonomy.ts` `THRESHOLD`           | 60      | Refuse if model confidence < floor                        |
| Per-position cap    | `lib/agent/autonomy.ts` `MAX_POSITION_PCT`    | 8%      | Refuse if order would push symbol > 8% of equity          |
| Order notional cap  | `lib/agent/autonomy.ts` `ORDER_DOLLARS`       | $1,000  | Default order size for market orders                      |
| Live-quote sanity   | `lib/agent/autonomy.ts`                       | —       | Refuse if no fresh snapshot (10-min window)               |
| Market-closed check | `lib/agent/autonomy.ts`                       | —       | Refuse day orders outside market hours                    |
| Drawdown breaker    | `user_goals.max_drawdown_pct`                 | 20%     | Pauses autonomous cycle when equity < start * (1-d)       |
| Human approval      | `lib/agent/queue.ts`                          | always  | Every order sits in `pending_decisions` until approved    |
| Grace window        | `user_goals.grace_seconds`                    | 300s    | Auto-executes after N seconds in `autonomous` mode only   |
| Per-account session | Supabase RLS on every table                   | —       | No cross-tenant reads possible                            |

The human-in-the-loop path is the **strongest** gate. Every agent
trade intent (and every chat-proposed trade) is written to
`pending_decisions` with a unique `resolve_token`; webhooks route
inbound Telegram/WhatsApp/Apple/Email messages back to that row.
The order is *not* sent to Alpaca until one of:
- the user clicks **Approve** in the web UI (`/app/queue`),
- the user taps the inline button on Telegram/WhatsApp/Email,
- the grace period elapses in `autonomous` mode.

---

## 4. Alpaca infrastructure

### 4.1 What we use

- **Trading API** (`paper-api.alpaca.markets`): account, positions,
  orders, options orders, portfolio history, clock.
- **Market Data API** (`data.alpaca.markets`): snapshots, latest
  quotes, option chains (`/v1beta1/options/contracts`),
  option snapshots + greeks + IV (`/v1beta1/options/snapshots`),
  historical bars, news.
- **MCP server** (`mcp/alpaca-mcp/server.mjs`) — a stand-alone
  JSON-RPC 2.0 stdio server that wraps the entire surface above
  as 17 MCP `tools`. Any MCP host (Claude, Cursor, ChatGPT) can
  drive the same broker the web app uses. Zero npm dependencies.

### 4.2 Server-side wrapper

`lib/alpaca/server.ts` is the only file that talks to Alpaca. It
exports:

- `getAccount`, `getPositions`, `getOpenOrders`, `cancelOrder`
- `getSnapshot`, `getQuotes`, `getBars`, `getNews`,
  `getPortfolioHistory`, `getClock`, `getAsset`
- `placeOrder` (equity)
- `getOptionChain`, `getOptionExpirations`, `getOptionSnapshots`,
  `placeOptionOrder`
- `composeStrategy` — composes covered call, protective put, bull
  call spread, bear put spread from the live chain

All requests go through a single `call()` helper that adds the
`APCA-API-KEY-ID` / `APCA-API-SECRET-KEY` headers, parses errors
cleanly, and uses `cache: "no-store"` so we never serve a stale quote
to the LLM.

### 4.3 Data flow

```
                    ┌──────────────┐
                    │  /app/* UI   │
                    └──────┬───────┘
                           │ fetch
                           ▼
            ┌──────────────────────────┐
            │  app/api/* route.ts     │  (Next.js server actions)
            └──────────┬───────────────┘
                       │ server-only
                       ▼
            ┌──────────────────────────┐
            │  lib/alpaca/server.ts   │  (single fetch wrapper)
            └──────────┬───────────────┘
                       │ HTTPS
            ┌──────────┴───────────────────────────────┐
            ▼                                           ▼
   https://paper-api.alpaca.markets         https://data.alpaca.markets
   (Trading)                                (Market Data + Options)
```

The MCP server sits **beside** the web app and goes through the
exact same Alpaca endpoints (just with its own fetch wrapper).

### 4.4 Supabase persistence

Eleven tables, all RLS-locked to the owning `auth.uid()`:

- `profiles` — per-user settings (display name, autonomy, etc.)
- `user_goals` — target P&L, drawdown, watchlist, grace seconds
- `user_settings` — channel config (Telegram bot, WhatsApp token,
  Apple Business Chat, Resend)
- `watchlist` — user-added symbols (combined with seeded defaults
  in the cycle)
- `decisions` — every agent or chat evaluation, refused or not
- `positions` — historical fill ledger (for the equity chart fallback)
- `pending_decisions` — every trade waiting on human approval
- `chat_sessions` + `chat_messages` — Perplexity-style history
- `agent_goals` + `agent_plans` + `agent_reflections` — autonomous
  self-state
- `agent_activity` — append-only log of every cycle / wake / brief /
  reflection event
- `notification_log` — every channel delivery + inbound reply

All migrations applied automatically through
`app/api/admin/install-schema/route.ts` which calls a plpgsql
helper `vermilion_apply(text)`.

### 4.5 Notifications (the human-in-the-loop bridge)

Four channels, all real and demoable when credentials are
configured:

- **In-app** — always on, via `agent_activity` + the `/app/queue`
  page. Webhook back-channel is a `pending_decisions.resolve_token`
  link the user clicks.
- **Telegram** — Bot API sendMessage with inline keyboard
  `Approve / Decline / Comment`. Webhook parses
  `callback_query` + free-text replies.
- **WhatsApp Cloud API** — interactive button list (max 3 buttons).
  Inbound webhook maps `button.text` → resolve action.
- **Apple Business Chat** — Messages framework `InteractiveMessage`
  (queued, requires a registered Apple Business Chat account to
  actually deliver).
- **Email** — Resend + HTML buttons. Webhook back-channel is a
  signed `resolve_token` URL, single-click approve/decline.

If credentials are absent, the channel **gracefully no-ops** and
the decision is still written to `notification_log` so the in-app
queue works.

### 4.6 Cron + self-prompt

`app/api/cron/{evaluate,morning-brief,reflect}/route.ts` are
authenticated by a shared `CRON_SECRET` header. The local
demo runs them via `mavis cron` every 26 min so the dev server
stays up, plus:
- **Morning brief** at 09:35 ET Mon–Fri
- **Reflection** at 16:10 ET Mon–Fri

The agent also **wakes itself on visit**: opening `/app` after
`STALE_AFTER_MS` of staleness triggers a fresh cycle.

---

## 5. UI / Design

Editorial Henry / ai.work aesthetic — obsidian (#000) / carbon
(#141414) / tar (#0c0c0c) surfaces, bone / ash / smoke / chalk
type, 100px-radius pills, no rounded corners anywhere. Full-bleed
mountain hero on the landing page. Perplexity-style 3-column chat
workspace. Real-time Alpaca equity curve with a positions-derived
fallback and a synthetic ramp as the final fallback.

Motion vocabulary: CSS `clip-path` reveals, scroll-linked opacity
ramps, and a live `AgentPulse` ticker on the dashboard that flashes
green for "agent ran a cycle in the last 10 min", amber for "agent
is thinking", grey for "agent idle".

---

## 6. Why Vermilion wins

- **Hits every hackathon requirement on the nose.** Options trading
  (covered calls, protective puts, vertical spreads, OCC-symbol
  orders); MCP server (17 tools, JSON-RPC 2.0 stdio, zero deps);
  paper account; autonomous agent; $100k starting balance.
- **Defensible AI.** The model can refuse. The audit log shows
  every refusal with a reason. The reflection step writes a daily
  post-mortem.
- **Human-in-the-loop that actually works.** Approve/decline from
  Telegram, WhatsApp, Apple, or Email — not just the web UI.
- **Original.** No other entry has all four of: options, MCP, multi-
  channel notifications, and self-reflections.
- **Demoable.** All routes respond, all buttons work, the agent
  cycle runs on demand, the queue is interactive, the options
  workbench shows real chains.

The agent refuses most of the time. That's the point. Vermilion
is the **first trading agent that ships with a conscience.**
