"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Row = {
  id: string;
  symbol: string;
  action: "buy" | "sell" | "short" | "cover";
  qty: number;
  est_price: number | null;
  confidence: number;
  threshold: number;
  reasoning: string;
  sources: { tag: string; text: string }[] | null;
  status: "pending" | "approved" | "declined" | "expired" | "executed" | "failed";
  user_comment: string | null;
  resolve_token: string;
  expires_at: string;
  created_at: string;
};

const ACTION_TONE: Record<string, string> = {
  buy: "var(--color-execute)",
  sell: "var(--color-refuse)",
  short: "var(--color-refuse)",
  cover: "var(--color-execute)",
};

export function QueueActions({ row }: { row: Row }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);

  const submit = (action: "approve" | "decline" | "comment") => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/decisions/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: row.id, action, comment: comment || undefined }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.ok) {
          setError(j.error ?? "Failed");
          return;
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const expiresAt = new Date(row.expires_at);
  const minutesLeft = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000));
  const tone = ACTION_TONE[row.action] ?? "var(--color-bone)";

  return (
    <article
      className="rounded-cards p-5 md:p-6"
      style={{ background: "var(--color-graphite)" }}
    >
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex-1 min-w-[260px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="px-2.5 py-0.5 rounded-pills"
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
              {row.action}
            </span>
            <h3
              className="text-bone-white"
              style={{ fontSize: "22px", letterSpacing: "-0.014em", fontWeight: 400 }}
            >
              {row.qty} {row.symbol}
            </h3>
            <span
              className="text-ash"
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "12px",
              }}
            >
              @ ~${row.est_price?.toFixed(2) ?? "—"}
            </span>
            <span
              className="text-ash ml-auto"
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {minutesLeft}m left to decide
            </span>
          </div>
          <p
            className="text-fog mt-3"
            style={{ fontSize: "14px", lineHeight: 1.5 }}
          >
            {row.reasoning}
          </p>
          {row.sources && row.sources.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {row.sources.slice(0, 4).map((s, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-pills"
                  style={{
                    fontFamily: "var(--font-replica-mono)",
                    fontSize: "10px",
                    color: "var(--color-ash)",
                    border: "1px solid #2a2a2f",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  {s.tag}
                </span>
              ))}
            </div>
          )}
          {row.user_comment && (
            <p
              className="text-bone-white mt-3"
              style={{ fontSize: "12px", fontStyle: "italic" }}
            >
              Your note: {row.user_comment}
            </p>
          )}
        </div>
      </div>

      {showComment && (
        <div className="mt-4">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Leave a note for Vermilion — it reads your comment before the next cycle."
            className="w-full px-3 py-2 outline-none"
            style={{
              background: "var(--color-tar)",
              border: "1px solid var(--color-smoke)",
              borderRadius: 6,
              fontSize: "13px",
              minHeight: 60,
              color: "var(--color-bone)",
            }}
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => submit("approve")}
          disabled={pending}
          className="pill-primary disabled:opacity-50"
          style={{
            background: "var(--color-execute)",
            color: "var(--color-obsidian)",
            fontWeight: 600,
          }}
        >
          ✓ Approve
        </button>
        <button
          type="button"
          onClick={() => submit("decline")}
          disabled={pending}
          className="pill-primary disabled:opacity-50"
          style={{
            background: "var(--color-refuse)",
            color: "var(--color-obsidian)",
            fontWeight: 600,
          }}
        >
          ✗ Decline
        </button>
        <button
          type="button"
          onClick={() => {
            if (showComment && comment) submit("comment");
            else setShowComment(true);
          }}
          disabled={pending}
          className="pill-ghost disabled:opacity-50"
        >
          💬 {showComment ? "Save comment" : "Add comment"}
        </button>
        <span className="ml-auto text-ash" style={{ fontSize: "11px" }}>
          {row.confidence.toFixed(0)}% conf · {row.threshold.toFixed(0)}% threshold
        </span>
      </div>

      {error && (
        <p className="mt-3" style={{ color: "var(--color-refuse)", fontSize: "12px" }}>
          {error}
        </p>
      )}
    </article>
  );
}
