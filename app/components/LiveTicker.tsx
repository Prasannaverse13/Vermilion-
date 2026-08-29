"use client";

import { useEffect, useState } from "react";

type Tick = {
  symbol: string;
  price: number;
  change: number;
};

const INITIAL_TICKS: Tick[] = [
  { symbol: "NVDA", price: 178.43, change: -0.62 },
  { symbol: "AAPL", price: 181.92, change: 0.18 },
  { symbol: "VTI", price: 246.81, change: 0.04 },
  { symbol: "MSFT", price: 408.07, change: -0.32 },
  { symbol: "META", price: 519.74, change: 0.87 },
  { symbol: "TSLA", price: 248.51, change: 1.24 },
  { symbol: "SPY", price: 552.18, change: 0.21 },
  { symbol: "QQQ", price: 478.55, change: -0.14 },
];

/**
 * LiveTicker — thin bar at the top of the page showing the current ET
 * time ticking every second and a row of mock market ticks that drift
 * every ~2.5s. Each price update flashes its color briefly to feel
 * like a real feed.
 */
export function LiveTicker() {
  const [time, setTime] = useState<string>("--:--:--");
  const [ticks, setTicks] = useState<Tick[]>(INITIAL_TICKS);
  const [flashIndex, setFlashIndex] = useState<number | null>(null);
  const [flashKind, setFlashKind] = useState<"pos" | "neg" | null>(null);

  useEffect(() => {
    const fmt = (d: Date) =>
      d.toLocaleTimeString("en-US", {
        timeZone: "America/New_York",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    setTime(fmt(new Date()));
    const timeInterval = setInterval(() => setTime(fmt(new Date())), 1000);

    const tickInterval = setInterval(() => {
      setTicks((prev) => {
        const idx = Math.floor(Math.random() * prev.length);
        const drift = (Math.random() - 0.5) * 0.6;
        const next = prev.map((t, i) => {
          if (i !== idx) return t;
          const newPrice = Math.max(0.01, t.price + drift);
          const newChange = t.change + drift * 0.08;
          return { ...t, price: newPrice, change: newChange };
        });
        setFlashIndex(idx);
        setFlashKind(drift >= 0 ? "pos" : "neg");
        window.setTimeout(() => setFlashIndex(null), 1400);
        return next;
      });
    }, 2500);

    return () => {
      clearInterval(timeInterval);
      clearInterval(tickInterval);
    };
  }, []);

  return (
    <div
      className="w-full overflow-hidden"
      style={{
        background: "var(--color-obsidian)",
        borderBottom: "1px solid var(--color-smoke)",
        fontFamily: "var(--font-replica-mono)",
        fontSize: "10px",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      <div className="flex items-center px-4 md:px-6 py-2 gap-6">
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="w-1.5 h-1.5 rounded-full live-dot"
            style={{ background: "var(--color-bone)" }}
          />
          <span className="text-ash">ET</span>
          <span className="text-bone tabular-nums">{time}</span>
        </div>

        <AgentPulse />

        <div className="flex-1 overflow-hidden">
          <div className="ticker-track">
            {ticks.map((t, i) => (
              <div
                key={t.symbol}
                className="flex items-center gap-2 shrink-0"
              >
                <span className="text-ash">{t.symbol}</span>
                <span
                  className="text-bone tabular-nums"
                  style={{
                    color:
                      flashIndex === i
                        ? t.change >= 0
                          ? "var(--color-execute)"
                          : "var(--color-refuse)"
                        : "var(--color-bone)",
                    transition: "color 1400ms cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                >
                  ${t.price.toFixed(2)}
                </span>
                <span
                  className="tabular-nums"
                  style={{
                    color:
                      t.change >= 0 ? "var(--color-execute)" : "var(--color-refuse)",
                  }}
                >
                  {t.change >= 0 ? "▲" : "▼"}
                  {Math.abs(t.change).toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 shrink-0">
          <span className="text-ash">paper</span>
          <span className="text-smoke">·</span>
          <span className="text-ash">alpaca</span>
        </div>
      </div>
    </div>
  );
}

/**
 * AgentPulse — the small "vermilion: just woke up / refused NVDA" chip
 * that lives inside the LiveTicker. It subscribes to the same SSE
 * stream the activity page uses, so the agent's actions echo in real
 * time across the whole app.
 */
function AgentPulse() {
  const [latest, setLatest] = useState<{ kind: string; title: string; at: number } | null>(null);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/agent/activity/stream");
    } catch {
      return;
    }
    es.addEventListener("activity", (e) => {
      try {
        const row = JSON.parse((e as MessageEvent).data) as {
          kind: string;
          title: string;
        };
        setLatest({ kind: row.kind, title: row.title, at: Date.now() });
        setPulse(true);
        window.setTimeout(() => setPulse(false), 1200);
      } catch {
        /* ignore */
      }
    });
    return () => es?.close();
  }, []);

  if (!latest) {
    return (
      <div className="hidden md:flex items-center gap-2 shrink-0 text-ash">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: "var(--color-ash)" }}
        />
        <span>vermilion · idle</span>
      </div>
    );
  }

  const color =
    latest.kind === "order-placed"
      ? "var(--color-execute)"
      : latest.kind === "order-failed" || latest.kind === "snapshot-failed"
        ? "var(--color-refuse)"
        : latest.kind === "reflection" || latest.kind === "morning-brief"
          ? "var(--color-bone)"
          : "var(--color-bone)";

  return (
    <div
      className="hidden md:flex items-center gap-2 shrink-0"
      style={{
        opacity: pulse ? 1 : 0.85,
        transition: "opacity 600ms ease",
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{
          background: color,
          boxShadow: pulse ? `0 0 0 3px ${color}40` : "none",
          transition: "box-shadow 600ms ease",
        }}
      />
      <span style={{ color }}>vermilion</span>
      <span className="text-ash">·</span>
      <span className="text-bone truncate max-w-[40ch]" title={latest.title}>
        {latest.title.toLowerCase()}
      </span>
    </div>
  );
}
