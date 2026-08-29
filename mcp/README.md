# Vermilion — Alpaca MCP Server

This is the **Alpaca MCP server** required by the [Alpaca AI Trading Agents
Hackathon on lablab.ai](https://lablab.ai/event/alpaca-ai-trading-agents-hackathon).
It exposes Vermilion's full paper-trading surface (account, positions,
orders, **options chain, options order, options strategy composer**,
quotes, snapshots, history, news, bars, clock) as Model Context Protocol
tools that any MCP-compatible host (Claude Desktop, Cursor, ChatGPT,
OpenCode, VS Code, etc.) can drive directly.

The server is a single-file `server.mjs` with **zero npm dependencies**
(only `node:fs` and `node:path` are used). It reads the same
`APCA_API_KEY_ID` / `APCA_API_SECRET_KEY` env vars the Vermilion web app
uses, so it talks to the same paper-trading account.

## Run standalone

```bash
# from the project root
npm run mcp
# or directly
node mcp/alpaca-mcp/server.mjs
```

The server logs `listening on stdio — tools: 17` to stderr and waits for
JSON-RPC 2.0 messages on stdin.

## Install into an MCP host

Add this entry to your `claude_desktop_config.json`,
`~/.cursor/mcp.json`, or equivalent:

```json
{
  "mcpServers": {
    "vermilion-alpaca": {
      "command": "node",
      "args": ["C:/Users/Prasa/Downloads/Alpaca/vermilion/mcp/alpaca-mcp/server.mjs"],
      "env": {
        "APCA_API_KEY_ID": "<your paper key>",
        "APCA_API_SECRET_KEY": "<your paper secret>"
      }
    }
  }
}
```

The server will then expose these tools to the host:

| Tool                              | What it does                                                 |
| --------------------------------- | ------------------------------------------------------------ |
| `alpaca_get_account`              | Account snapshot (cash, equity, BP, PDT)                     |
| `alpaca_get_positions`            | All open positions                                           |
| `alpaca_get_open_orders`          | Open (unfilled) orders                                       |
| `alpaca_cancel_order`             | Cancel an order by id                                        |
| `alpaca_get_snapshot`             | Latest trade/quote + daily bar                               |
| `alpaca_get_quotes`               | Top-of-book quotes for one or more symbols                   |
| `alpaca_get_news`                 | Alpaca-curated headlines                                     |
| `alpaca_get_bars`                 | Historical OHLCV bars                                        |
| `alpaca_get_portfolio_history`    | Equity curve + P&L                                           |
| `alpaca_get_clock`                | Market clock + next open/close                               |
| `alpaca_get_asset`                | Asset metadata (name, exchange, tradable, shortable)         |
| `alpaca_place_order`              | Place an equity order                                        |
| `alpaca_get_option_expirations`   | Monthly option expirations for an underlying                 |
| `alpaca_get_option_chain`         | Live option chain (filter by expiry / type)                  |
| `alpaca_get_option_snapshots`     | Quotes + greeks + IV for option symbols                       |
| `alpaca_place_option_order`       | Place an options order on an OCC symbol                      |
| `alpaca_compose_strategy`         | Compose a multi-leg strategy (covered call, protective put, bull/bear call/put spread) |

## Smoke test

`smoke.mjs` is a self-contained Node script that starts the server,
sends `initialize` + a handful of `tools/call` requests, and prints
the responses. Run it with:

```bash
node mcp/alpaca-mcp/smoke.mjs
```

Expected output:

```
initialize -> protocol=2024-11-05 server=vermilion-alpaca-mcp@0.1.0
tools/list -> 17 tools
clock -> is_open=... next_open=... next_close=...
account -> id=... status=ACTIVE cash=100000 equity=100000 bp=400000
option_expirations(AAPL) -> ...   (404 if paper account lacks options)
snapshot(AAPL) -> last_price=$...
```
