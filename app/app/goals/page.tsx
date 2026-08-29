import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CONSTITUTION, NORTH_STARS } from "@/lib/agent/constitution";
import { Reveal } from "@/app/components/Reveal";
import { GoalEditor } from "@/app/components/GoalEditor";
import { getAccountSummary, isMarketOpen } from "@/lib/alpaca/server";

/**
 * /app/goals — Vermilion's autonomous dashboard
 * ----------------------------------------------
 * 3 panels:
 *   1. Constitution   — the written rules the agent is bound by
 *   2. North-star     — current values vs targets
 *   3. Open plans     — long-running theses the agent is committed to
 *
 * All data sourced from Supabase (RLS-protected). If the agent
 * hasn't run yet, panels show empty-state copy that still feels
 * confident, not broken.
 */

type Goal = {
  metric: string;
  current: number | null;
  target: string;
  trend: "up" | "down" | "flat";
  captured_at: string;
};

type Plan = {
  id: string;
  title: string;
  thesis: string;
  status: "open" | "progressing" | "closed" | "abandoned";
  symbols: string[];
  opened_at: string;
  closed_at: string | null;
  progress: number;
  outcome: string | null;
};

type Reflection = {
  id: string;
  session_date: string;
  total_decisions: number;
  total_refused: number;
  total_executed: number;
  text: string;
  wins: { symbol: string; action: string; pnl: number; lesson: string }[] | null;
  misses: { symbol: string; action: string; pnl: number; lesson: string }[] | null;
  created_at: string;
};

export default async function GoalsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return null; // middleware redirects
  }

  const [{ data: goalsRaw }, { data: plans }, { data: reflections }, marketOpen, { data: userGoals }] =
    await Promise.all([
      supabase
        .from("agent_goals")
        .select("metric, current, target, trend, captured_at")
        .eq("user_id", user.id)
        .order("captured_at", { ascending: false })
        .limit(200),
      supabase
        .from("agent_plans")
        .select("id, title, thesis, status, symbols, opened_at, closed_at, progress, outcome")
        .eq("user_id", user.id)
        .order("opened_at", { ascending: false })
        .limit(20),
      supabase
        .from("agent_reflections")
        .select("id, session_date, total_decisions, total_refused, total_executed, text, wins, misses, created_at")
        .eq("user_id", user.id)
        .order("session_date", { ascending: false })
        .limit(7),
      isMarketOpen().catch(() => false),
      supabase
        .from("user_goals")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  // Reduce goals: keep latest per metric.
  const latestByMetric = new Map<string, Goal>();
  for (const g of (goalsRaw ?? []) as Goal[]) {
    if (!latestByMetric.has(g.metric)) latestByMetric.set(g.metric, g);
  }
  const latestGoals = Array.from(latestByMetric.values());

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
            Autonomous agent · live
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
            Vermilion's goals, rules, and plans.
          </h1>
          <p
            className="text-fog mt-4 max-w-2xl"
            style={{ fontSize: "16px", lineHeight: 1.5 }}
          >
            This is what the agent is bound by, what it's optimizing
            for, and what it's currently working on. Nothing here is
            hidden — every number comes from the same database the
            agent reads.
          </p>
        </header>
      </Reveal>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-10">
        {/* North-star metrics */}
        <Reveal className="lg:col-span-2">
          <section
            className="rounded-cards p-6 md:p-7 h-full"
            style={{ background: "var(--color-tar)", border: "1px solid #1a1a1f" }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2
                className="text-bone-white"
                style={{ fontSize: "20px", letterSpacing: "-0.018em", fontWeight: 400 }}
              >
                North-star metrics
              </h2>
              <span
                className="text-ash"
                style={{
                  fontFamily: "var(--font-replica-mono)",
                  fontSize: "10px",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {latestGoals.length ? `${latestGoals.length} captured` : "no data yet"}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {NORTH_STARS.map((ns) => {
                const live = latestGoals.find((g) => g.metric === ns.id);
                const value = live?.current ?? null;
                const ok = value == null ? "muted" : ns.id === "refusal-rate"
                  ? value >= 70 ? "ok" : "warn"
                  : ns.id === "edge-rate"
                    ? value >= 40 ? "ok" : "warn"
                    : ns.id === "unrealized-pl"
                      ? value >= 0 ? "ok" : "warn"
                      : ns.id === "open-positions"
                        ? value <= 8 ? "ok" : "warn"
                        : "muted";
                const tone =
                  ok === "ok"
                    ? "var(--color-execute)"
                    : ok === "warn"
                      ? "var(--color-caution)"
                      : "var(--color-ash)";
                return (
                  <div
                    key={ns.id}
                    className="rounded-cards p-4"
                    style={{ background: "var(--color-graphite)" }}
                  >
                    <p
                      className="text-ash"
                      style={{
                        fontFamily: "var(--font-replica-mono)",
                        fontSize: "9px",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                      }}
                    >
                      {ns.label}
                    </p>
                    <p
                      className="mt-2 text-bone-white"
                      style={{
                        fontSize: "32px",
                        lineHeight: 1,
                        letterSpacing: "-0.02em",
                        fontWeight: 400,
                      }}
                    >
                      {value == null ? "—" : ns.unit === "$" ? `$${value.toLocaleString()}` : `${value}${ns.unit === "%" ? "%" : ""}`}
                    </p>
                    <p
                      className="mt-2"
                      style={{
                        fontFamily: "var(--font-replica-mono)",
                        fontSize: "10px",
                        color: tone,
                      }}
                    >
                      {ns.target}
                    </p>
                  </div>
                );
              })}
            </div>
            <p
              className="text-fog mt-5"
              style={{ fontSize: "13px", lineHeight: 1.5 }}
            >
              Targets aren't goals to hit — they're the agent's
              self-imposed rules of engagement. The agent refuses
              more often than not, on purpose.
            </p>
          </section>
        </Reveal>

        {/* Market state */}
        <Reveal>
          <section
            className="rounded-cards p-6 md:p-7 h-full"
            style={{ background: "var(--color-tar)", border: "1px solid #1a1a1f" }}
          >
            <h2
              className="text-bone-white"
              style={{ fontSize: "20px", letterSpacing: "-0.018em", fontWeight: 400 }}
            >
              Status
            </h2>
            <div className="mt-4 space-y-3">
              <Row label="Market" value={marketOpen ? "OPEN" : "CLOSED"} tone={marketOpen ? "ok" : "muted"} />
              <Row label="Constitution" value={`${CONSTITUTION.length} clauses`} />
              <Row label="Open plans" value={String((plans ?? []).filter((p: Plan) => p.status === "open" || p.status === "progressing").length)} />
              <Row label="Reflections" value={String((reflections ?? []).length)} />
            </div>
            <p
              className="text-fog mt-5"
              style={{ fontSize: "13px", lineHeight: 1.5 }}
            >
              The agent updates these numbers on its own. You can
              watch it work in the{" "}
              <Link href="/app/activity" className="text-bone-white underline">
                activity feed
              </Link>
              .
            </p>
          </section>
        </Reveal>
      </div>

      {/* Your settings — user-editable goals, autonomy, notification channels */}
      <Reveal>
        <h2
          className="text-bone-white mt-14 mb-5"
          style={{ fontSize: "22px", letterSpacing: "-0.014em", fontWeight: 400 }}
        >
          Your settings
        </h2>
      </Reveal>
      <GoalEditor
        goals={
          (userGoals as Parameters<typeof GoalEditor>[0]["goals"]) ?? {
            user_id: user.id,
            target_refusal_rate: 70,
            target_edge_rate: 40,
            target_sharpe: 1,
            max_drawdown_pct: 15,
            position_cap_pct: 8,
            confidence_threshold: 60,
            autonomy_level: "suggest",
            auto_approve_delay_s: 300,
            notifications: {},
          }
        }
      />

      {/* Constitution */}
      <Reveal>
        <h2
          className="text-bone-white mt-14 mb-5"
          style={{ fontSize: "22px", letterSpacing: "-0.014em", fontWeight: 400 }}
        >
          The constitution
        </h2>
      </Reveal>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {CONSTITUTION.map((c, i) => (
          <Reveal key={c.id} delay={i} as="div">
            <article
              className="rounded-cards p-5 md:p-6 h-full"
              style={{
                background: c.category === "LAW" ? "var(--color-graphite)" : "var(--color-tar)",
                border:
                  c.category === "LAW"
                    ? "1px solid rgba(244, 114, 114, 0.18)"
                    : "1px solid #1a1a1f",
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="px-2.5 py-0.5 rounded-pills"
                  style={{
                    fontFamily: "var(--font-replica-mono)",
                    fontSize: "10px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: c.category === "LAW" ? "#f29a8e" : "var(--color-bone)",
                    border: c.category === "LAW" ? "1px solid rgba(244, 114, 114, 0.4)" : "1px solid #2a2a2f",
                    background: c.category === "LAW" ? "rgba(244, 114, 114, 0.06)" : "rgba(255,255,255,0.03)",
                  }}
                >
                  {c.category}
                </span>
                <span
                  className="text-ash"
                  style={{
                    fontFamily: "var(--font-replica-mono)",
                    fontSize: "10px",
                    letterSpacing: "0.08em",
                  }}
                >
                  {c.id}
                </span>
              </div>
              <p
                className="text-bone-white"
                style={{ fontSize: "15px", lineHeight: 1.45, letterSpacing: "-0.01em" }}
              >
                {c.text}
              </p>
            </article>
          </Reveal>
        ))}
      </div>

      {/* Plans */}
      <Reveal>
        <h2
          className="text-bone-white mt-14 mb-5"
          style={{ fontSize: "22px", letterSpacing: "-0.014em", fontWeight: 400 }}
        >
          Active theses
        </h2>
      </Reveal>
      {plans && plans.length > 0 ? (
        <div className="flex flex-col gap-3">
          {(plans as Plan[]).map((p) => (
            <PlanCard key={p.id} plan={p} />
          ))}
        </div>
      ) : (
        <div
          className="rounded-cards p-8 text-center"
          style={{ background: "var(--color-graphite)" }}
        >
          <p
            className="text-fog"
            style={{ fontSize: "15px", lineHeight: 1.5 }}
          >
            No active theses yet. Vermilion opens a plan when it
            sees something worth committing to — a range-bound
            ticker, an earnings hedge, a watchlist expansion. Open
            one via the chat:{" "}
            <span
              className="text-bone-white"
              style={{ fontFamily: "var(--font-replica-mono)", fontSize: "13px" }}
            >
              "Plan: AAPL range-bound 220-240"
            </span>
            .
          </p>
        </div>
      )}

      {/* Reflections */}
      <Reveal>
        <h2
          className="text-bone-white mt-14 mb-5"
          style={{ fontSize: "22px", letterSpacing: "-0.014em", fontWeight: 400 }}
        >
          Daily reflections
        </h2>
      </Reveal>
      {reflections && reflections.length > 0 ? (
        <div className="flex flex-col gap-3">
          {(reflections as Reflection[]).map((r) => (
            <article
              key={r.id}
              className="rounded-cards p-5 md:p-6"
              style={{ background: "var(--color-tar)", border: "1px solid #1a1a1f" }}
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span
                    className="text-bone-white"
                    style={{ fontSize: "16px", letterSpacing: "-0.01em" }}
                  >
                    {new Date(r.session_date + "T00:00:00").toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span
                    className="text-ash"
                    style={{
                      fontFamily: "var(--font-replica-mono)",
                      fontSize: "11px",
                    }}
                  >
                    {r.total_refused}/{r.total_decisions} refused · {r.total_executed} executed
                  </span>
                </div>
              </div>
              <p
                className="text-bone-white mt-3"
                style={{ fontSize: "15px", lineHeight: 1.5, letterSpacing: "-0.01em" }}
              >
                {r.text}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div
          className="rounded-cards p-8 text-center"
          style={{ background: "var(--color-graphite)" }}
        >
          <p
            className="text-fog"
            style={{ fontSize: "15px", lineHeight: 1.5 }}
          >
            No reflections yet. Vermilion writes one every weekday
            at 4:10 PM ET — a self-audit of the day's decisions,
            with wins, misses, and what it'll do differently.
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "ok" | "muted" }) {
  const color =
    tone === "ok"
      ? "var(--color-execute)"
      : tone === "muted"
        ? "var(--color-ash)"
        : "var(--color-bone-white)";
  return (
    <div className="flex items-center justify-between">
      <span
        className="text-ash"
        style={{
          fontFamily: "var(--font-replica-mono)",
          fontSize: "10px",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span style={{ fontFamily: "var(--font-replica-mono)", fontSize: "13px", color }}>
        {value}
      </span>
    </div>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const statusTone =
    plan.status === "open"
      ? { color: "var(--color-bone)", border: "1px solid #2a2a2f" }
      : plan.status === "progressing"
        ? { color: "#9fd9b4", border: "1px solid rgba(31, 226, 116, 0.4)" }
        : plan.status === "closed"
          ? { color: "var(--color-ash)", border: "1px solid #1a1a1f" }
          : { color: "#f29a8e", border: "1px solid rgba(244, 114, 114, 0.3)" };
  return (
    <article
      className="rounded-cards p-5 md:p-6"
      style={{ background: "var(--color-graphite)" }}
    >
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h3
              className="text-bone-white"
              style={{ fontSize: "18px", letterSpacing: "-0.01em", fontWeight: 500 }}
            >
              {plan.title}
            </h3>
            <span
              className="px-2.5 py-0.5 rounded-pills"
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                ...statusTone,
              }}
            >
              {plan.status}
            </span>
            {plan.symbols.length > 0 && (
              <span
                className="text-ash"
                style={{ fontFamily: "var(--font-replica-mono)", fontSize: "11px" }}
              >
                {plan.symbols.join(" · ")}
              </span>
            )}
          </div>
          <p
            className="text-fog mt-2"
            style={{ fontSize: "14px", lineHeight: 1.5 }}
          >
            {plan.thesis}
          </p>
          {plan.outcome && (
            <p
              className="text-bone-white mt-3"
              style={{ fontSize: "13px", lineHeight: 1.5, fontStyle: "italic" }}
            >
              Outcome: {plan.outcome}
            </p>
          )}
        </div>
        <div className="shrink-0 w-32 md:w-40">
          <div
            className="text-ash mb-1"
            style={{
              fontFamily: "var(--font-replica-mono)",
              fontSize: "9px",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Progress
          </div>
          <div
            className="h-1 rounded-pills overflow-hidden"
            style={{ background: "#1a1a1f" }}
          >
            <div
              className="h-full"
              style={{
                width: `${Math.max(0, Math.min(100, plan.progress))}%`,
                background:
                  plan.status === "closed"
                    ? "var(--color-ash)"
                    : plan.status === "abandoned"
                      ? "#f29a8e"
                      : "#9fd9b4",
                transition: "width 600ms ease",
              }}
            />
          </div>
          <div
            className="text-bone-white mt-1"
            style={{ fontFamily: "var(--font-replica-mono)", fontSize: "12px" }}
          >
            {plan.progress}%
          </div>
        </div>
      </div>
    </article>
  );
}
