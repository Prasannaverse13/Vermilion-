import { createClient } from "@/lib/supabase/server";
import { Reveal } from "@/app/components/Reveal";
import { QueueActions } from "@/app/components/QueueActions";

/**
 * /app/queue — Vermilion's pending-decision queue
 * ------------------------------------------------
 * Every time the agent wants to trade, it parks a row here and
 * fires a notification. The user reviews, approves, declines, or
 * comments — via this page, Telegram, WhatsApp, Apple Messages, or
 * email reply.
 *
 * Three states each row can be in: pending, approved, declined,
 * expired, executed, failed. The page defaults to the most recent
 * 50, newest first.
 */

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
  approved_at: string | null;
  declined_at: string | null;
  expired_at: string | null;
  executed_at: string | null;
  order_id: string | null;
  fill_price: number | null;
  error: string | null;
  resolve_token: string;
  expires_at: string;
  created_at: string;
};

export default async function QueuePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows } = await supabase
    .from("pending_decisions")
    .select("id, symbol, action, qty, est_price, confidence, threshold, reasoning, sources, status, user_comment, approved_at, declined_at, expired_at, executed_at, order_id, fill_price, error, resolve_token, expires_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const list = (rows ?? []) as Row[];
  const pending = list.filter((r) => r.status === "pending");
  const resolved = list.filter((r) => r.status !== "pending");

  return (
    <div className="px-6 md:px-10">
      <Reveal>
        <header className="pt-6 md:pt-8">
          <p
            className="text-ash"
            style={{
              fontFamily: "var(--font-replica-mono)",
              fontSize: "11px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Pending decisions · human-in-the-loop
          </p>
          <h1
            className="text-bone-white mt-2"
            style={{
              fontSize: "44px",
              lineHeight: 1.05,
              letterSpacing: "-0.025em",
              fontWeight: 300,
            }}
          >
            The queue.
          </h1>
          <p
            className="text-fog mt-3 max-w-2xl"
            style={{ fontSize: "16px", lineHeight: 1.5 }}
          >
            Every trade Vermilion wants to make is parked here first.
            Approve, decline, or comment — the same buttons work in
            Telegram, WhatsApp, Apple Messages, and email.
          </p>
        </header>
      </Reveal>

      <Reveal>
        <h2
          className="text-bone-white mt-12 mb-4"
          style={{ fontSize: "22px", letterSpacing: "-0.014em", fontWeight: 400 }}
        >
          Awaiting your sign-off — {pending.length}
        </h2>
      </Reveal>
      {pending.length === 0 ? (
        <div
          className="rounded-cards p-8 text-center"
          style={{ background: "var(--color-graphite)" }}
        >
          <p
            className="text-fog"
            style={{ fontSize: "15px", lineHeight: 1.5 }}
          >
            Nothing pending. The agent isn't asking to do anything
            right now. Configure your notification channels in{" "}
            <a href="/app/goals" className="text-bone-white underline">
              Goals
            </a>{" "}
            to be paged when the next opportunity lands.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map((r) => (
            <QueueActions key={r.id} row={r} />
          ))}
        </div>
      )}

      <Reveal>
        <h2
          className="text-bone-white mt-14 mb-4"
          style={{ fontSize: "22px", letterSpacing: "-0.014em", fontWeight: 400 }}
        >
          Recently resolved — {resolved.length}
        </h2>
      </Reveal>
      {resolved.length === 0 ? (
        <p
          className="text-ash"
          style={{ fontSize: "13px", lineHeight: 1.5 }}
        >
          No resolved decisions yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {resolved.map((r) => (
            <ResolvedCard key={r.id} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function ResolvedCard({ row }: { row: Row }) {
  const tone =
    row.status === "executed"
      ? "var(--color-execute)"
      : row.status === "failed" || row.status === "expired"
        ? "var(--color-refuse)"
        : row.status === "declined"
          ? "var(--color-ash)"
          : "var(--color-bone)";
  const ts =
    row.executed_at ?? row.declined_at ?? row.expired_at ?? row.created_at;
  return (
    <article
      className="rounded-cards p-5 md:p-6"
      style={{ background: "var(--color-graphite)" }}
    >
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
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
              {row.status}
            </span>
            <h3
              className="text-bone-white"
              style={{ fontSize: "18px", letterSpacing: "-0.01em", fontWeight: 500 }}
            >
              {row.action.toUpperCase()} {row.qty} {row.symbol}
            </h3>
            <span
              className="text-ash"
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "11px",
              }}
            >
              {row.est_price ? `@ ~$${Number(row.est_price).toFixed(2)}` : ""}
            </span>
          </div>
          <p
            className="text-fog mt-2"
            style={{ fontSize: "13px", lineHeight: 1.5 }}
          >
            {row.reasoning}
          </p>
          {row.user_comment && (
            <p
              className="text-bone-white mt-2"
              style={{ fontSize: "12px", fontStyle: "italic" }}
            >
              Comment: {row.user_comment}
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
          {new Date(ts).toLocaleString("en-US", {
            timeZone: "America/New_York",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </span>
      </div>
    </article>
  );
}
