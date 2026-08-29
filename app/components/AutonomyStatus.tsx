"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Vermilion — Autonomy Status panel
 * ---------------------------------
 * A small live strip that shows:
 *   - when the agent last woke itself up
 *   - whether the market is open
 *   - how stale the last decision is (and a soft nudge if a cycle
 *     is overdue)
 *   - the next scheduled wake (cron every 15 min while market is open)
 *
 * It calls HEAD /api/cron/evaluate every 30 s while mounted, which
 * returns the age of the latest decision row. Cheap query, no LLM
 * call, no Alpaca traffic.
 */

type Status = {
  lastDecisionAt: string | null;
  ageMs: number | null;
  stale: boolean;
  marketOpen?: boolean;
  nextPlannedMs?: number | null;
};

export function AutonomyStatus({
  initial,
  marketOpen,
  cycleTriggeredOnVisit,
}: {
  initial: Status;
  marketOpen: boolean;
  cycleTriggeredOnVisit: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initial);
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  const [wakeFired, setWakeFired] = useState(cycleTriggeredOnVisit);

  // Tick the "now" clock every 30s so the age label feels live.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Poll /api/agent/status every 60s for fresh status.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/agent/status");
        if (!res.ok) return;
        const j = (await res.json()) as Status;
        if (!cancelled) setStatus(j);
      } catch {
        /* offline — keep last known */
      }
    };
    const t = setInterval(tick, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // If the dashboard is stale on first visit, the server already kicked
  // a cycle (maybeWakeOnVisit). When that cycle finishes the row count
  // is fresh, so we just nudge the router to re-render server data.
  useEffect(() => {
    if (wakeFired) {
      // Give the cycle a couple of seconds to persist, then refresh.
      const t = setTimeout(() => {
        startTransition(() => router.refresh());
      }, 3500);
      return () => clearTimeout(t);
    }
  }, [wakeFired, router]);

  const ageMs = status.ageMs ?? (status.lastDecisionAt ? now - new Date(status.lastDecisionAt).getTime() : null);
  const ageLabel = ageMs == null
    ? "no cycle yet"
    : ageMs < 60_000
      ? "just now"
      : ageMs < 60 * 60_000
        ? `${Math.max(1, Math.round(ageMs / 60_000))} min ago`
        : `${Math.round(ageMs / 3_600_000)} h ago`;

  const nextLabel = !marketOpen
    ? "market closed"
    : status.stale
      ? "overdue — wake-up on next visit"
      : "≤ 15 min";

  return (
    <div
      className="rounded-cards p-4 md:p-5 flex flex-wrap items-center gap-x-6 gap-y-3"
      style={{
        background: "var(--color-tar)",
        border: "1px solid #1a1a1f",
      }}
      aria-label="Autonomy status"
    >
      <div className="flex items-center gap-2">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: status.stale ? "var(--color-caution)" : "var(--color-execute)",
            boxShadow: status.stale
              ? "0 0 0 3px rgba(255, 150, 52, 0.18)"
              : "0 0 0 3px rgba(31, 226, 116, 0.18)",
            animation: status.stale ? "pulse 1.6s ease-in-out infinite" : undefined,
          }}
          aria-hidden
        />
        <span
          className="text-bone-white"
          style={{
            fontFamily: "var(--font-replica-mono)",
            fontSize: "11px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {status.stale ? "Autonomy · overdue" : "Autonomy · live"}
        </span>
      </div>

      <Field
        label="Last self-wake"
        value={
          wakeFired
            ? "just now (auto)"
            : ageLabel
        }
        highlight={wakeFired}
      />
      <Field
        label="Market"
        value={marketOpen ? "OPEN" : "CLOSED"}
        tone={marketOpen ? "ok" : "muted"}
      />
      <Field
        label="Next planned"
        value={nextLabel}
        tone={status.stale ? "warn" : "muted"}
      />
      <Field
        label="Triggered by"
        value={wakeFired ? "self-wake" : "user / cron"}
      />

      {pending && (
        <span
          className="text-ash"
          style={{
            fontFamily: "var(--font-replica-mono)",
            fontSize: "10px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          refreshing…
        </span>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  highlight = false,
  tone = "default",
}: {
  label: string;
  value: string;
  highlight?: boolean;
  tone?: "default" | "ok" | "muted" | "warn";
}) {
  const color =
    tone === "ok"
      ? "var(--color-execute)"
      : tone === "warn"
        ? "var(--color-caution)"
        : tone === "muted"
          ? "var(--color-ash)"
          : highlight
            ? "var(--color-bone-white)"
            : "var(--color-bone)";
  return (
    <div className="flex flex-col">
      <span
        className="text-ash"
        style={{
          fontFamily: "var(--font-replica-mono)",
          fontSize: "9px",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        className="mt-0.5"
        style={{
          fontFamily: "var(--font-replica-mono)",
          fontSize: "12px",
          color,
        }}
      >
        {value}
      </span>
    </div>
  );
}
