# Vermilion

> **A self-auditing AI trading agent on Alpaca.**
> *Built for the lablab.ai × Alpaca AI Trading Agents Hackathon (28 Aug – 4 Sept 2026).*

Vermilion is a Next.js 16 web app that runs an autonomous DeepSeek-powered
trading agent on an Alpaca paper-trading account. The agent wakes itself
up, evaluates a 13-symbol watchlist, proposes equity **and options**
trades, and then waits for your sign-off on Telegram / WhatsApp / Email /
in-app queue before it places a single order. Every decision — refused
or executed — is logged in an immutable Supabase audit trail. The same
broker surface is also exposed as a stand-alone MCP server so any other
AI agent (Claude, Cursor, ChatGPT) can drive it.

---

## Table of contents

1. [Highlights](#highlights)
2. [Quick start](#quick-start)
3. [Tools, services & AI used](#tools-services--ai-used)
4. [Project structure — where the code lives](#project-structure--where-the-code-lives)
5. [Architecture](#architecture)
6. [Decision loop & risk gates](#decision-loop--risk-gates)
7. [Human-in-the-loop notifications](#human-in-the-loop-notifications)
8. [MCP server](#mcp-server)
9. [The /app routes](#the-app-routes)
10. [Database schema](#database-schema)
11. [Cron schedules](#cron-schedules)
12. [Configuration reference](#configuration-reference)
13. [Deployment notes](#deployment-notes)
14. [Hackathon submission](#hackathon-submission)

---

## Highlights

- **Real Alpaca paper trading** — `paper-api.alpaca.markets` + `data.alpaca.markets`, no mocks anywhere.
- **Options trading** — covered calls, protective puts, bull/bear call/put spreads, with a multi-leg strategy composer that picks live OCC contracts from the option chain.
- **Autonomous agent** — self-prompt, morning brief, end-of-day reflection, wake-on-visit, North-Star capture, goals + plans + reflections, append-only activity log.
- **Human-in-the-loop** — every order intent lands in a `pending_decisions` queue; webhooks route inbound Telegram/WhatsApp/Apple/Email messages back to that row for one-click approve/decline.
- **MCP server** — 17-tool JSON-RPC 2.0 stdio server (`mcp/alpaca-mcp/server.mjs`) that wraps the full broker surface; drop-in for Claude Desktop, Cursor, ChatGPT, etc.
- **Perplexity-style chat** — streaming SSE chat with file attachment parsing (xlsx, pdf, docx) and structured trade proposals.
- **Editorial UI** — Henry / ai.work design language: obsidian / carbon / tar surfaces, bone / ash / smoke / chalk text, 100px-radius pills, no rounded corners.
- **Self-healing** — every cron / wake / chat cycle is wrapped in retry/backoff, and the agent marks the cycle `degraded` rather than failing the whole run if Alpaca hiccups.

---

## Quick start

### 1. Clone & install

```bash
git clone https://github.com/Prasannaverse13/Vermilion-.git
cd Vermilion-
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Then fill in the four required keys in `.env.local` (see [Configuration reference](#configuration-reference)):

```env
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
SUPABASE_SERVICE_ROLE_KEY="..."
APCA_API_KEY_ID="PK..."
APCA_API_SECRET_KEY="..."
DEEPSEEK_API_KEY="sk-..."
```

### 3. Apply the database schema

Open `app/api/admin/install-schema/route.ts`'s GET handler in a browser **once** (or run the SQL migrations manually — see `supabase/migrations/`). The handler applies all four migrations via a plpgsql helper called `vermilion_apply(text)`.

### 4. Run

```bash
npm run dev      # Next.js dev server on http://localhost:3000
npm run mcp      # MCP server (stdio, JSON-RPC 2.0)
npm run build    # production build
npm start        # production server
```

Open `http://localhost:3000`, click **Sign in** (or create an account on `/signup`), and the dashboard at `/app` is your home base.

---

## Tools, services & AI used

### Frontend & runtime

| Tool / library       | Version  | Why we use it                                                                 |
| -------------------- | -------- | ----------------------------------------------------------------------------- |
| **Next.js**          | 16.3.1   | App router, server components, route groups, server actions, stream-friendly. |
| **React**            | 19.2.8   | Server/client component model, `use()` hook for streaming chat.              |
| **TypeScript**       | 5.x      | Strict mode, end-to-end type safety from Supabase rows to UI.                |
| **Tailwind CSS v4**  | 4.x      | Token-driven design system, no `tailwind.config.js`, all in CSS.             |
| **PostCSS**          | latest   | Tailwind pipeline.                                                            |
| **Node.js**          | 22       | Native `fetch`, top-level `await`, ESM-only MCP server.                      |

### Backend & data

| Service              | What we use it for                                                  |
| -------------------- | ------------------------------------------------------------------- |
| **Supabase**         | Postgres, Auth, RLS, server-side `service_role` for cron routes.    |
| **Alpaca Trading API** | Paper account, orders, positions, portfolio history, clock.        |
| **Alpaca Market Data**| Stock snapshots, quotes, bars, news, options chain + greeks.        |
| **Alpaca MCP**       | The official MCP server reference (we built our own for richer tools). |

### AI

| Model / service      | Where it runs                                          | Purpose                                            |
| -------------------- | ------------------------------------------------------ | -------------------------------------------------- |
| **DeepSeek `deepseek-chat`** | `lib/ai/deepseek.ts`                          | Decision agent — scores each watchlist symbol.     |
| **DeepSeek `deepseek-reasoner`** | same                                   | Optional high-stakes reasoning pass.                |

DeepSeek was chosen over Anthropic / OpenAI for cost + the
`deepseek-reasoner` mode that produces chain-of-thought we can
attach to the audit log.

### Notifications (human-in-the-loop)

| Channel              | Library / API                                     |
| -------------------- | ------------------------------------------------- |
| **Telegram**         | Bot API (raw HTTPS, no SDK)                       |
| **WhatsApp**         | Meta WhatsApp Cloud API (raw HTTPS)               |
| **Apple Business Chat** | Messages framework (queued, requires registered account) |
| **Email**            | Resend (`fetch` against `api.resend.com`)         |

All four are real implementations; they **gracefully no-op** when
credentials are absent so the in-app `/app/queue` keeps working.

### Optional partner tech

The hackathon lists [Featherless AI](https://featherless.ai) credits
as a partner bonus. Vermilion is **OpenAI-only** for image and chat
endpoints, so the Featherless prize isn't targeted; the architecture
is provider-agnostic and can swap in Featherless inference in a
single file change.

---

## Project structure — where the code lives

```
vermilion/
├── app/                                # Next.js App Router
│   ├── page.tsx                        # Marketing landing page (/)
│   ├── signin/  signup/                # Auth pages
│   ├── (auth)/                         # Route group for auth pages
│   ├── app/                            # Auth-gated app workspace
│   │   ├── page.tsx                    # /app — agent dashboard
│   │   ├── watchlist/                  # /app/watchlist
│   │   ├── stocks/[symbol]/            # /app/stocks/AAPL
│   │   ├── chat/  chat/[id]/           # /app/chat + per-thread
│   │   ├── decisions/                  # /app/decisions — full audit log
│   │   ├── portfolio/                  # /app/portfolio
│   │   ├── goals/                      # /app/goals — goals + autonomy level
│   │   ├── activity/                   # /app/activity — agent activity feed
│   │   ├── queue/                      # /app/queue — pending trade approvals
│   │   ├── options/                    # /app/options — options chain + strategies
│   │   └── settings/                   # /app/settings — channel config
│   ├── api/                            # Server routes
│   │   ├── chat/                       # /api/chat, /api/chat/parse, /api/chat/stream, /api/chat/confirm
│   │   ├── cron/                       # /api/cron/{evaluate,morning-brief,reflect}
│   │   ├── decisions/                  # /api/decisions/{queue,resolve,resolve/link}
│   │   ├── alpaca/                     # /api/alpaca/{account,options,sync}
│   │   ├── agent/                      # /api/agent/{status,goals,plan,activity/stream}
│   │   ├── webhooks/                   # /api/webhooks/{telegram,whatsapp,apple,resend}
│   │   ├── stocks/[symbol]/            # /api/stocks/AAPL
│   │   ├── watchlist/                  # /api/watchlist
│   │   └── admin/install-schema/       # one-shot migration runner
│   ├── components/                     # Client + server components
│   │   ├── AgentActions.tsx            # "Run a cycle now" + "Wake the agent" buttons
│   │   ├── AutonomyStatus.tsx          # Live agent pulse
│   │   ├── ChatWorkspace.tsx           # Perplexity-style 3-col chat
│   │   ├── EquityChart.tsx             # Real-time Alpaca equity curve
│   │   ├── NewsTicker.tsx              # Side-scrolling news tape
│   │   ├── OptionsWorkbench.tsx        # Options chain + strategy builder
│   │   ├── QueueActions.tsx            # Approve / decline / comment
│   │   ├── GoalEditor.tsx              # /app/goals form
│   │   ├── Reveal.tsx  CountUp.tsx     # Motion primitives
│   │   └── ...
│   ├── globals.css                     # Tailwind v4 + Henry design tokens
│   └── layout.tsx                      # Root layout
├── lib/
│   ├── alpaca/server.ts                # ★ Single source of truth for Alpaca REST + options
│   ├── ai/deepseek.ts                  # ★ DeepSeek client + tool definitions (propose_trade, propose_options_strategy, create_plan, refuse)
│   ├── agent/
│   │   ├── autonomy.ts                 # ★ Decision loop, risk gates, refusal-by-default
│   │   ├── constitution.ts             # System prompt + tool policy
│   │   ├── lifecycle.ts                # Activity log, North-Star capture, reflections
│   │   └── queue.ts                    # pending_decisions writer + approval sweep
│   ├── supabase/{client,middleware,server}.ts  # RLS-locked Supabase clients
│   └── notifications.ts                # Telegram / WhatsApp / Apple / Email senders
├── mcp/
│   ├── README.md                       # Judge-facing MCP install guide
│   └── alpaca-mcp/
│       ├── package.json                # `vermilion-alpaca-mcp` bin
│       ├── server.mjs                  # ★ JSON-RPC 2.0 stdio MCP server (17 tools, zero npm deps)
│       └── smoke.mjs                   # Self-contained integration test
├── scripts/                            # One-shot DB migration helpers
│   ├── apply-agent-tables.mjs
│   ├── apply-chat-sessions.mjs
│   ├── apply-migration.js
│   ├── preview-migration.mjs
│   └── probe-supabase.mjs
├── public/                             # Static assets (hero.jpg, og.png, favicon)
├── proxy.ts                            # Next.js 16 proxy (replaces middleware.ts)
├── .env.example                        # All env vars, with placeholders
├── .gitignore                          # .env*, .next/, .bak, node_modules, .vercel/
├── next.config.ts
├── tailwind / postcss configs
├── WRITE_UP.md                         # One-page submission write-up
└── README.md                           # ← you are here
```

★ = file the judges should open first.

---

## Architecture

```
                            ┌──────────────────────┐
                            │  /  marketing site   │  (public)
                            └──────────┬───────────┘
                                       │
                            ┌──────────▼───────────┐
                            │  /app  dashboard     │  (Supabase-auth)
                            └──────────┬───────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
   ┌──────────▼────────┐   ┌───────────▼──────────┐  ┌──────────▼────────┐
   │  /app/chat        │   │  /app/queue          │  │  /app/options     │
   │  streaming SSE    │   │  human-in-the-loop   │  │  options chain +  │
   │  + tool calls     │   │  approval sweep      │  │  strategy composer│
   └──────────┬────────┘   └───────────┬──────────┘  └──────────┬────────┘
              │                        │                        │
              └────────────────────────┼────────────────────────┘
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            │                          │                          │
   ┌────────▼─────────┐   ┌─────────────▼──────────┐   ┌─────────▼─────────┐
   │  lib/agent/      │   │  lib/alpaca/server.ts  │   │  lib/ai/deepseek  │
   │  autonomy.ts     │◄──┤  (single fetch wrapper)│──►│  decision model    │
   │  decision loop   │   └─────────────┬──────────┘   └───────────────────┘
   └────────┬─────────┘                 │
            │                           ▼
   ┌────────▼─────────┐    ┌──────────────────────────────┐
   │  lib/agent/      │    │  https://paper-api.alpaca…   │
   │  queue.ts        │    │  https://data.alpaca…        │
   │  pending_deci…   │    └──────────────────────────────┘
   └────────┬─────────┘
            │
   ┌────────▼─────────┐    ┌──────────────────────────────┐
   │  Supabase (RLS)  │◄───┤  Telegram / WhatsApp / Apple │
   │  audit + state   │    │  Email webhooks              │
   └──────────────────┘    └──────────────────────────────┘
```

---

## Decision loop & risk gates

The cycle runs from three triggers, all funneling through
`lib/agent/autonomy.ts#runAutonomousCycle`:

1. **Cron** — `*/15` during market hours on a Hobby-tier schedule.
2. **Wake-on-visit** — opening `/app` after `STALE_AFTER_MS` of staleness.
3. **Manual button** — "Run a cycle now" in `/app` header.

Each cycle:

1. Reads the user's `user_goals` row.
2. Pulls live snapshots for the combined watchlist + account summary.
3. Reads the last 20 decisions + 3 reflections for context.
4. Calls DeepSeek with the constitution prompt + the snapshot bundle.
5. DeepSeek returns one of:
   - `propose_trade` — structured equity order
   - `propose_options_strategy` — multi-leg strategy intent
   - `create_plan` — written thesis, no fill
   - `refuse` — explicit no with a reason
6. Every intent is written to `pending_decisions` (human-in-the-loop).
7. After the grace period (default 300s), `autonomous` mode auto-executes;
   `suggest` / `manual` mode waits forever.

**Hard risk gates (refuse-by-default):**

| Gate                    | Default | Source                                |
| ----------------------- | ------- | ------------------------------------- |
| Confidence floor        | 60      | `THRESHOLD` in `lib/agent/autonomy.ts` |
| Per-position cap        | 8%      | `MAX_POSITION_PCT`                     |
| Order notional cap      | $1,000  | `ORDER_DOLLARS`                        |
| Live-quote sanity       | 10 min  | snapshot freshness check               |
| Market-closed check     | —       | refuses day orders outside RTH        |
| Drawdown breaker        | 20%     | `user_goals.max_drawdown_pct`         |
| Human approval          | always  | every order in `pending_decisions`    |
| Per-account session     | —       | Supabase RLS on every table           |

---

## Human-in-the-loop notifications

Every agent trade intent (and every chat-proposed trade) is written
to `pending_decisions` with a unique `resolve_token`. Four channels
deliver the same payload; the user can respond from any of them.

```
                    ┌──────────────────────┐
                    │  agent intent        │
                    │  pending_decisions   │
                    └──────────┬───────────┘
                               │
       ┌───────────┬───────────┼───────────┬───────────┐
       ▼           ▼           ▼           ▼           ▼
   Telegram   WhatsApp    Apple Chat    Email      In-app
   bot+inline button   button list   inline    /app/queue
                                          + HTML
       │           │           │           │           │
       └───────────┴─────┬─────┴───────────┴───────────┘
                         ▼
              /api/webhooks/{channel}
              → resolve token → APPROVE / DECLINE / COMMENT
```

The Telegram / WhatsApp / Apple / Email integrations are in
`app/api/webhooks/*` and `lib/notifications.ts`. Each is keyed on the
unique `resolve_token`, so the same trade can be approved from any
channel — first response wins.

---

## MCP server

`mcp/alpaca-mcp/server.mjs` is a self-contained **JSON-RPC 2.0 stdio**
server that exposes the full Vermilion broker surface as **17 MCP
tools**. It depends on **zero npm packages** (just `node:fs` + `node:path`)
so it runs anywhere Node 18+ does.

Tools exposed:

```
alpaca_get_account              alpaca_place_order
alpaca_get_positions            alpaca_get_option_expirations
alpaca_get_open_orders          alpaca_get_option_chain
alpaca_cancel_order             alpaca_get_option_snapshots
alpaca_get_snapshot             alpaca_place_option_order
alpaca_get_quotes               alpaca_compose_strategy
alpaca_get_news                 alpaca_get_portfolio_history
alpaca_get_bars                 alpaca_get_clock
alpaca_get_asset
```

Install into an MCP host (Claude Desktop, Cursor, ChatGPT, etc.) by
adding this to your MCP config:

```json
{
  "mcpServers": {
    "vermilion-alpaca": {
      "command": "node",
      "args": ["<repo>/mcp/alpaca-mcp/server.mjs"],
      "env": {
        "APCA_API_KEY_ID": "<your paper key>",
        "APCA_API_SECRET_KEY": "<your paper secret>"
      }
    }
  }
}
```

Run standalone: `npm run mcp`
Smoke test: `node mcp/alpaca-mcp/smoke.mjs`

---

## The /app routes

| Route                          | What it does                                                         |
| ------------------------------ | -------------------------------------------------------------------- |
| `/app`                         | Agent dashboard — equity chart, recent decisions, agent pulse.       |
| `/app/watchlist`               | Add/remove symbols to your personal watchlist.                       |
| `/app/stocks/[symbol]`         | Per-stock detail — snapshot, news, chat.                             |
| `/app/chat`                    | Perplexity-style chat workspace (streaming SSE).                     |
| `/app/chat/[id]`               | Specific chat thread.                                                |
| `/app/decisions`               | Full audit log of every agent evaluation.                            |
| `/app/portfolio`               | Positions + P&L.                                                     |
| `/app/goals`                   | Target P&L, max drawdown, autonomy level, watchlist.                 |
| `/app/activity`                | Live activity feed — wake-ups, cycles, reflections.                  |
| `/app/queue`                   | Pending trade approvals (human-in-the-loop).                         |
| `/app/options`                 | Options chain + strategy composer.                                   |
| `/app/settings`                | Notification channel config + sign-out.                              |

Public: `/`, `/signin`, `/signup`, `/auth/callback`, `/auth/signout`.

---

## Database schema

11 tables, every one RLS-locked to the owning `auth.uid()`:

| Table                | Purpose                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `profiles`           | Per-user display name + initial settings.                        |
| `user_goals`         | Target P&L, max drawdown, autonomy level, watchlist, grace.      |
| `user_settings`      | Notification channel config.                                     |
| `watchlist`          | User-added symbols (combined with seeded defaults in cycle).     |
| `decisions`          | Every agent or chat evaluation (refused or executed).            |
| `positions`          | Historical fill ledger (used for the equity chart fallback).     |
| `pending_decisions`  | Trade intents awaiting human approval.                           |
| `chat_sessions`      | Perplexity-style chat threads.                                   |
| `chat_messages`      | Individual messages in each thread.                              |
| `agent_goals`        | Long-running theses the agent is tracking.                       |
| `agent_plans`        | Plan objects (open / closed / paused).                           |
| `agent_reflections`  | End-of-day post-mortems.                                         |
| `agent_activity`     | Append-only event log (wake, cycle, brief, reflect).            |
| `notification_log`   | Every channel delivery + inbound reply.                          |

Apply all four migrations with one call to the plpgsql helper
`vermilion_apply(text)` (exposed via `/api/admin/install-schema`).

---

## Cron schedules

| Schedule              | Endpoint                     | What it does                              |
| --------------------- | ---------------------------- | ----------------------------------------- |
| `*/15` during RTH     | `/api/cron/evaluate`         | Run a full decision cycle.                |
| `0 9 * * 1-5` ET      | `/api/cron/morning-brief`    | Post a morning brief to self-notes chat.  |
| `10 16 * * 1-5` ET     | `/api/cron/reflect`          | Write end-of-day reflection.              |

All three are authenticated by a shared `CRON_SECRET` header. On a
Hobby-tier Vercel budget, only the 2/day quota (morning brief +
reflection) is wired by default; the per-cycle cron runs locally via
`mavis cron self` (see `vermilion-dev-restart`).

---

## Configuration reference

All env vars are documented in `.env.example`. Summary:

| Variable                       | Required | Description                                         |
| ------------------------------ | -------- | --------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`     | yes      | Supabase project URL                                |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`| yes      | Public anon key (client-side)                       |
| `SUPABASE_SERVICE_ROLE_KEY`    | yes      | Service-role key (server-only, never exposed)       |
| `APCA_API_KEY_ID`              | yes      | Alpaca paper API key                                |
| `APCA_API_SECRET_KEY`          | yes      | Alpaca paper API secret                             |
| `APCA_PAPER_BASE_URL`          | no       | defaults to `https://paper-api.alpaca.markets`      |
| `APCA_DATA_BASE_URL`           | no       | defaults to `https://data.alpaca.markets`           |
| `DEEPSEEK_API_KEY`             | yes      | DeepSeek API key                                    |
| `CRON_SECRET`                  | no       | Shared secret for cron auth (empty = disabled)      |
| `TELEGRAM_BOT_TOKEN`           | no       | Enables Telegram notifications when set             |
| `TELEGRAM_CHAT_ID`             | no       | Target chat id                                      |
| `WHATSAPP_TOKEN`               | no       | Enables WhatsApp notifications when set             |
| `WHATSAPP_PHONE_ID`            | no       | WhatsApp Cloud API phone id                         |
| `WHATSAPP_VERIFY_TOKEN`        | no       | Webhook verify token (default "vermilion")          |
| `APPLE_BUSINESS_CHAT_*`        | no       | Apple Business Chat credentials                     |
| `RESEND_API_KEY`               | no       | Enables Email notifications when set                |
| `RESEND_FROM`                  | no       | defaults to `Vermilion <onboarding@resend.dev>`     |

`.env.local` is gitignored. **Never commit it.**

---

## Deployment notes

- **Local dev** is the intended demo path (the project ships with a
  `vermilion-dev-restart` cron that re-launches `npm run dev` every
  26 minutes so the 30-minute process cap doesn't kill it).
- **Vercel / GitHub Actions deployment is intentionally NOT used.**
  The hackathon allows any host; Vermilion runs on `localhost:3000`
  for the demo. There is no `.vercel/` config in the repo.
- The MCP server is fully independent and can be deployed separately
  (e.g. on Fly.io, Railway, or a tiny EC2) by copying the
  `mcp/alpaca-mcp/` directory and running `node server.mjs`.

---

## Hackathon submission

- **Hackathon:** lablab.ai × Alpaca AI Trading Agents Hackathon (28 Aug – 4 Sept 2026)
- **Team name:** Vermilion
- **Prize pool:** $6,000
- **One-page write-up:** [`WRITE_UP.md`](./WRITE_UP.md)
- **MCP install guide:** [`mcp/README.md`](./mcp/README.md)

### Requirements coverage

| Requirement                              | Where                                                    |
| ---------------------------------------- | -------------------------------------------------------- |
| Autonomous AI trading agent              | `lib/agent/{autonomy,constitution,lifecycle,queue}.ts`   |
| Alpaca Trading API                       | `lib/alpaca/server.ts`                                   |
| **Alpaca MCP server**                    | `mcp/alpaca-mcp/server.mjs` (17 tools, zero deps)        |
| **Options trading**                      | `composeStrategy` (4 templates) + `placeOptionOrder`      |
| Paper trading environment                | Alpaca paper account, $100k starting balance             |
| $100k starting balance                   | Verified — `cash: 100000`, `equity: 100000`              |
| New paper account dedicated to submission | Per the lablab rules                                     |
| One-page write-up                        | `WRITE_UP.md`                                            |

---

## License

MIT. See `LICENSE` (or assume MIT if absent).
