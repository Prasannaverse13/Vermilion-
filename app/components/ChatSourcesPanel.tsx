"use client";

export function ChatSourcesPanel({
  liveSnapshot,
  account,
  watchlistCount,
}: {
  liveSnapshot?: { symbol: string; last: number | null } | null;
  account?: { equity: number; cash: number; buying_power: number } | null;
  watchlistCount?: number;
}) {
  return (
    <aside
      className="hidden lg:flex flex-col shrink-0 h-full overflow-y-auto"
      style={{
        width: "260px",
        background: "var(--color-obsidian)",
        borderLeft: "1px solid rgba(212, 208, 201, 0.08)",
        padding: "18px 14px",
        gap: 16,
      }}
    >
      {/* MCP context */}
      <div>
        <div
          className="mb-2"
          style={{
            fontFamily: "var(--font-replica-mono)",
            fontSize: "10px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--color-ash)",
          }}
        >
          MCP · Live context
        </div>

        {/* Live snapshot card */}
        <div
          className="rounded-cards p-3"
          style={{
            background: "var(--color-carbon)",
            border: "1px solid rgba(212, 208, 201, 0.08)",
          }}
        >
          <div className="flex items-baseline justify-between">
            <span
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "10px",
                color: "var(--color-smoke)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              ALPACA · Latest quote
            </span>
            <span
              className="w-1.5 h-1.5 rounded-full live-dot"
              style={{ background: "#1fe274" }}
            />
          </div>
          {liveSnapshot ? (
            <div className="mt-2">
              <div
                style={{
                  color: "var(--color-bone)",
                  fontSize: "22px",
                  fontWeight: 400,
                  letterSpacing: "-0.02em",
                }}
              >
                {liveSnapshot.symbol}
              </div>
              <div
                style={{
                  color: "var(--color-chalk)",
                  fontSize: "28px",
                  fontWeight: 400,
                  letterSpacing: "-0.025em",
                  lineHeight: 1.1,
                }}
              >
                {liveSnapshot.last != null ? `$${liveSnapshot.last.toFixed(2)}` : "—"}
              </div>
            </div>
          ) : (
            <div
              className="mt-2"
              style={{
                color: "var(--color-ash)",
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            >
              Ask about a ticker (e.g. <span style={{ color: "var(--color-bone)" }}>NVDA</span>) to pin a live quote here.
            </div>
          )}
        </div>

        {/* Account card */}
        {account && (
          <div
            className="rounded-cards p-3 mt-3"
            style={{
              background: "var(--color-carbon)",
              border: "1px solid rgba(212, 208, 201, 0.08)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "10px",
                color: "var(--color-smoke)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              MCP · Account
            </div>
            <Stat label="Equity" value={`$${account.equity.toFixed(2)}`} />
            <Stat label="Cash" value={`$${account.cash.toFixed(2)}`} />
            <Stat label="Buying power" value={`$${account.buying_power.toFixed(2)}`} />
          </div>
        )}

        {/* Watchlist summary */}
        {watchlistCount != null && (
          <div
            className="rounded-cards p-3 mt-3"
            style={{
              background: "var(--color-carbon)",
              border: "1px solid rgba(212, 208, 201, 0.08)",
            }}
          >
            <div className="flex items-center justify-between">
              <div
                style={{
                  fontFamily: "var(--font-replica-mono)",
                  fontSize: "10px",
                  color: "var(--color-smoke)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                WATCHLIST
              </div>
              <span
                style={{
                  color: "var(--color-bone)",
                  fontSize: "20px",
                  letterSpacing: "-0.02em",
                  fontWeight: 400,
                }}
              >
                {watchlistCount}
              </span>
            </div>
            <div
              className="mt-1"
              style={{ color: "var(--color-ash)", fontSize: "12px" }}
            >
              symbols the agent evaluates every cycle
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span
        style={{
          color: "var(--color-ash)",
          fontSize: "12px",
          letterSpacing: "-0.01em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: "var(--color-bone)",
          fontFamily: "var(--font-replica-mono)",
          fontSize: "13px",
          letterSpacing: "0.02em",
        }}
      >
        {value}
      </span>
    </div>
  );
}
