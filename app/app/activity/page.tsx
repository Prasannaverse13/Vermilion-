import { createClient } from "@/lib/supabase/server";
import { Reveal } from "@/app/components/Reveal";
import { AgentActivityStream } from "@/app/components/AgentActivityStream";

/**
 * /app/activity — Live activity feed
 * -----------------------------------
 * Append-only log of every autonomous action the agent has taken.
 * The page server-component fetches the latest 200; a small client
 * component subscribes to a Server-Sent Events stream and prepends
 * new rows in real-time.
 */

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

export default async function ActivityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows } = await supabase
    .from("agent_activity")
    .select("id, kind, title, detail, symbols, meta, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const initial = (rows ?? []) as Activity[];

  return (
    <div className="px-6 md:px-10">
      <Reveal>
        <header className="pt-6 md:pt-8 flex items-end justify-between flex-wrap gap-3">
          <div>
            <p
              className="text-ash"
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "11px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Agent activity · live
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
              What Vermilion is doing.
            </h1>
            <p
              className="text-fog mt-3 max-w-2xl"
              style={{ fontSize: "15px", lineHeight: 1.5 }}
            >
              Every autonomous action the agent takes — wake-ups,
              cycles, self-prompts, plan updates, reflections. New
              rows appear at the top in real time.
            </p>
          </div>
          <div
            className="text-ash"
            style={{
              fontFamily: "var(--font-replica-mono)",
              fontSize: "11px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {initial.length} events
          </div>
        </header>
      </Reveal>

      <div className="mt-10">
        <AgentActivityStream initial={initial} />
      </div>
    </div>
  );
}

export { KIND_LABEL, KIND_TONE };
