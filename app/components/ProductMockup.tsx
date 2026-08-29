"use client";

/**
 * ProductMockup — the white "Product UI Card" from the Henry brief.
 *
 *   "White (#ffffff) background — the only light surface in the dark
 *    system, making it pop as a product artifact. 6-10px border-radius.
 *    Contains nested rows: user avatar circle + name in NB International
 *    Pro, status badges with small colored dots, action buttons with
 *    100px radius pills. The inversion from dark to white inside this
 *    card is the system's primary visual trick — it signals 'this is a
 *    screenshot, not chrome'."
 *
 * We render a Vermilion-flavoured variant: a tiny live audit-log panel
 * showing two recent decisions, a CTA row, and a status footer. This
 * gives the hero real, believable content instead of a placeholder.
 *
 * Static (no client state) — it's an illustration of the product, not
 * a live component.
 */

type Row = {
  symbol: string;
  action: "Bought" | "Refused" | "Sold";
  qty?: string;
  conf: number;
  status: "executed" | "refused" | "watching";
  text: string;
};

const ROWS: Row[] = [
  {
    symbol: "NVDA",
    action: "Refused",
    conf: 0,
    status: "refused",
    text: "No live bid/ask; market closed. Will revisit next session.",
  },
  {
    symbol: "AAPL",
    action: "Bought",
    qty: "2 sh",
    conf: 60,
    status: "executed",
    text: "Last close $305.94; 0.6% of equity. Within 8% cap.",
  },
  {
    symbol: "TSLA",
    action: "Refused",
    conf: 0,
    status: "watching",
    text: "Wide bid/ask spread, low liquidity. Skipped.",
  },
];

const dotColor = (s: Row["status"]) =>
  s === "executed"
    ? "#10b981"
    : s === "refused"
      ? "#f43f5e"
      : "#9ca3af";

const tagBg = (s: Row["status"]) =>
  s === "executed"
    ? "rgba(16, 185, 129, 0.12)"
    : s === "refused"
      ? "rgba(244, 63, 94, 0.12)"
      : "rgba(0, 0, 0, 0.06)";

const tagFg = (s: Row["status"]) =>
  s === "executed"
    ? "#047857"
    : s === "refused"
      ? "#9f1239"
      : "#374151";

export function ProductMockup() {
  return (
    <div
      className="w-full"
      style={{
        background: "#ffffff",
        color: "#0a0a0a",
        borderRadius: 10,
        border: "1px solid rgba(0,0,0,0.08)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.04) inset, 0 30px 80px -20px rgba(0,0,0,0.6), 0 8px 24px -8px rgba(0,0,0,0.4)",
        padding: 20,
        fontFamily: "var(--font-replica-regular)",
      }}
    >
      {/* Title row */}
      <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
        <div className="flex items-center gap-2">
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: "#10b981",
              boxShadow: "0 0 0 3px rgba(16, 185, 129, 0.2)",
            }}
            aria-hidden
          />
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "-0.02em",
              color: "#0a0a0a",
            }}
          >
            Live audit log
          </span>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#6b7280",
          }}
        >
          paper · alpaca
        </span>
      </div>

      {/* Column header */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: "60px 1fr 90px",
          gap: 12,
          paddingBottom: 8,
          borderBottom: "1px solid #f1f1f1",
          marginBottom: 8,
        }}
      >
        <span style={mono(10, "#9ca3af")}>symbol</span>
        <span style={mono(10, "#9ca3af")}>reasoning</span>
        <span
          style={{
            ...mono(10, "#9ca3af"),
            textAlign: "right",
          }}
        >
          action
        </span>
      </div>

      {/* Rows */}
      {ROWS.map((r) => (
        <div
          key={r.symbol}
          className="grid"
          style={{
            gridTemplateColumns: "60px 1fr 90px",
            gap: 12,
            padding: "10px 0",
            alignItems: "start",
            borderBottom: "1px solid #f7f7f7",
          }}
        >
          <div className="flex items-center gap-1.5">
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: dotColor(r.status),
                flexShrink: 0,
              }}
              aria-hidden
            />
            <span
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: 12,
                fontWeight: 500,
                color: "#0a0a0a",
                letterSpacing: "-0.01em",
              }}
            >
              {r.symbol}
            </span>
          </div>
          <p
            style={{
              fontSize: 12,
              lineHeight: 1.35,
              color: "#374151",
              letterSpacing: "-0.01em",
            }}
          >
            {r.text}
          </p>
          <div
            className="flex items-center gap-1.5"
            style={{ justifyContent: "flex-end" }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "3px 8px",
                borderRadius: 100,
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "-0.01em",
                background: tagBg(r.status),
                color: tagFg(r.status),
              }}
            >
              {r.action}
            </span>
          </div>
        </div>
      ))}

      {/* Footer CTA */}
      <div
        className="flex items-center justify-between"
        style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #f1f1f1" }}
      >
        <span
          style={{
            fontSize: 11,
            color: "#6b7280",
            letterSpacing: "-0.01em",
          }}
        >
          3 of 13 symbols evaluated this cycle
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "6px 12px",
            borderRadius: 100,
            background: "#0a0a0a",
            color: "#ffffff",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "-0.01em",
          }}
        >
          Run cycle →
        </span>
      </div>
    </div>
  );
}

function mono(size: number, color: string): React.CSSProperties {
  return {
    fontFamily: "var(--font-replica-mono)",
    fontSize: size,
    fontWeight: 500,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color,
  };
}
