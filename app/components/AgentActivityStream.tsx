"use client";

import { useEffect, useState } from "react";

type Activity = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  symbols: string[];
  meta: Record<string, unknown> | null;
  created_at: string;
};

const KIND_LABEL: Record<string, string> = {
  "wake-on-visit": "wake-on-visit",
  "cron-cycle": "cron-cycle",
  "manual-cycle": "manual",
  "self-recovery": "self-recovery",
  "self-prompt": "self-prompt",
  "morning-brief": "morning brief",
  "reflection": "reflection",
  "plan-opened": "plan opened",
  "plan-updated": "plan update",
  "plan-closed": "plan closed",
  "snapshot-failed": "snapshot failed",
  "order-placed": "order placed",
  "order-failed": "order failed",
  "threshold-tightened": "threshold tightened",
  "threshold-loosened": "threshold loosened",
  "watchlist-expanded": "watchlist expanded",
  "watchlist-pruned": "watchlist pruned",
};

const KIND_TONE: Record<string, string> = {
  "wake-on-visit": "#9fd9b4",
  "cron-cycle": "#9fd9b4",
  "manual-cycle": "var(--color-bone)",
  "self-recovery": "#f29a8e",
  "self-prompt": "var(--color-bone)",
  "morning-brief": "#9fd9b4",
  "reflection": "var(--color-bone)",
  "plan-opened": "var(--color-bone)",
  "plan-updated": "var(--color-bone)",
  "plan-closed": "var(--color-ash)",
  "order-placed": "#9fd9b4",
  "order-failed": "#f29a8e",
};

export function AgentActivityStream({ initial }: { initial: Activity[] }) {
  const [items, setItems] = useState<Activity[]>(initial);
  const [live, setLive] = useState(false);
  const [pulse, setPulse] = useState(false);

  // Subscribe to the SSE stream. New rows prepend; cap at 200 to
  // keep the DOM manageable.
  useEffect(() => {
    const es = new EventSource("/api/agent/activity/stream");
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.addEventListener("activity", (e) => {
      try {
        const row = JSON.parse((e as MessageEvent).data) as Activity;
        setItems((prev) => {
          if (prev.some((p) => p.id === row.id)) return prev;
          const next = [row, ...prev].slice(0, 200);
          return next;
        });
        setPulse(true);
        setTimeout(() => setPulse(false), 800);
      } catch {
        /* ignore */
      }
    });
    return () => es.close();
  }, []);

  if (items.length === 0) {
    return (
      <div
        className="rounded-cards p-8 text-center"
        style={{ background: "var(--color-graphite)" }}
      >
        <p
          className="text-fog"
          style={{ fontSize: "15px", lineHeight: 1.5 }}
        >
          No activity yet. The agent is asleep — open the dashboard
          or wait for the next cron cycle. Every action it takes
          will appear here, in real time, with no human click
          required.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: live ? "var(--color-execute)" : "var(--color-ash)",
            boxShadow: live ? "0 0 0 3px rgba(31, 226, 116, 0.2)" : "none",
            animation: live ? "pulse 1.6s ease-in-out infinite" : undefined,
          }}
        />
        <span
          className="text-ash"
          style={{
            fontFamily: "var(--font-replica-mono)",
            fontSize: "11px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {live ? "live · streaming" : "reconnecting…"}
        </span>
      </div>

      <ol className="relative" style={{ listStyle: "none", padding: 0 }}>
        {items.map((a, i) => {
          const tone = KIND_TONE[a.kind] ?? "var(--color-ash)";
          const label = KIND_LABEL[a.kind] ?? a.kind;
          const isNew = pulse && i === 0;
          return (
            <li
              key={a.id}
              className="relative pl-6 py-3"
              style={{
                borderLeft: i === items.length - 1 ? "none" : "1px solid #1a1a1f",
              }}
            >
              <span
                className="absolute"
                style={{
                  left: "-5px",
                  top: "20px",
                  width: "9px",
                  height: "9px",
                  borderRadius: "50%",
                  background: tone,
                  boxShadow: isNew
                    ? `0 0 0 4px ${tone}40`
                    : "0 0 0 0 transparent",
                  transition: "box-shadow 600ms ease",
                }}
              />
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="px-2 py-0.5 rounded-pills"
                      style={{
                        fontFamily: "var(--font-replica-mono)",
                        fontSize: "10px",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: tone,
                        border: `1px solid ${tone}66`,
                        background: `${tone}0c`,
                      }}
                    >
                      {label}
                    </span>
                    <span
                      className="text-bone-white"
                      style={{ fontSize: "14px", letterSpacing: "-0.01em" }}
                    >
                      {a.title}
                    </span>
                    {a.symbols && a.symbols.length > 0 && (
                      <span
                        className="text-ash"
                        style={{
                          fontFamily: "var(--font-replica-mono)",
                          fontSize: "11px",
                        }}
                      >
                        {a.symbols.join(" · ")}
                      </span>
                    )}
                  </div>
                  {a.detail && (
                    <p
                      className="text-fog mt-1"
                      style={{ fontSize: "13px", lineHeight: 1.5 }}
                    >
                      {a.detail}
                    </p>
                  )}
                </div>
                <span
                  className="text-ash shrink-0"
                  style={{
                    fontFamily: "var(--font-replica-mono)",
                    fontSize: "11px",
                  }}
                >
                  {formatTime(a.created_at)}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }) + " ET";
}
