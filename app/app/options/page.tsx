import { createClient } from "@/lib/supabase/server";
import { Reveal } from "@/app/components/Reveal";
import { OptionsWorkbench } from "@/app/components/OptionsWorkbench";

/**
 * /app/options — Vermilion's options workbench
 * ----------------------------------------------
 * 3 panels:
 *   1. Underlying picker + chain (calls/puts for the selected expiry)
 *   2. Strategy composer — pick a strategy, see the legs, send to queue
 *   3. Open options positions from the paper account
 *
 * The chain data comes from Alpaca's options API via /api/alpaca/options.
 * The strategy composer routes the legs through the same pending-
 * decision queue the equity cycles use, so every options trade still
 * goes through human-in-the-loop sign-off.
 */

type OptionPosition = {
  asset_id: string;
  symbol: string;
  qty: string;
  side: "long" | "short";
  avg_entry_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  current_price: string;
  type: "call" | "put";
  strike_price: string;
  expiration_date: string;
};

export default async function OptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string; expiry?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Pull existing Alpaca option positions via the same route the
  // /api/alpaca/options uses internally. We do a direct call here
  // so the page is fully server-rendered.
  let positions: OptionPosition[] = [];
  try {
    const { getPositions } = await import("@/lib/alpaca/server");
    const all = await getPositions();
    positions = (all as unknown as OptionPosition[]).filter(
      (p) => (p as unknown as { asset_class?: string }).asset_class === "us_option",
    );
  } catch {
    /* swallow — paper accounts may not have options enabled */
  }

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
            Options workbench
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
            Options, on its own schedule.
          </h1>
          <p
            className="text-fog mt-3 max-w-2xl"
            style={{ fontSize: "16px", lineHeight: 1.5 }}
          >
            The same Vermilion discipline — refuse by default, queue
            every intent, sign off before it executes — applied to
            options. Pick a strategy, the agent composes the legs and
            parks them in your queue.
          </p>
        </header>
      </Reveal>

      <div className="mt-10">
        <OptionsWorkbench initialSymbol={sp.symbol} initialExpiry={sp.expiry} />
      </div>

      <Reveal>
        <h2
          className="text-bone-white mt-14 mb-4"
          style={{ fontSize: "22px", letterSpacing: "-0.014em", fontWeight: 400 }}
        >
          Open options positions
        </h2>
      </Reveal>
      {positions.length === 0 ? (
        <div
          className="rounded-cards p-6 text-center"
          style={{ background: "var(--color-graphite)" }}
        >
          <p className="text-fog" style={{ fontSize: "14px" }}>
            No open options positions. Approve a strategy from the
            workbench above to open one.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {positions.map((p) => {
            const pnl = Number(p.unrealized_pl);
            const tone = pnl >= 0 ? "var(--color-execute)" : "var(--color-refuse)";
            const side = p.side === "long" ? "LONG" : "SHORT";
            return (
              <article
                key={p.asset_id}
                className="rounded-cards p-5"
                style={{ background: "var(--color-graphite)" }}
              >
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="px-2 py-0.5 rounded-pills"
                        style={{
                          fontFamily: "var(--font-replica-mono)",
                          fontSize: "10px",
                          letterSpacing: "0.08em",
                          color: tone,
                          border: `1px solid ${tone}66`,
                          background: `${tone}0c`,
                        }}
                      >
                        {p.type.toUpperCase()} · {side}
                      </span>
                      <span
                        className="text-bone-white"
                        style={{ fontSize: "16px", fontWeight: 500 }}
                      >
                        {p.symbol}
                      </span>
                      <span
                        className="text-ash"
                        style={{
                          fontFamily: "var(--font-replica-mono)",
                          fontSize: "11px",
                        }}
                      >
                        strike ${p.strike_price} · exp {p.expiration_date}
                      </span>
                    </div>
                    <p
                      className="text-fog mt-1"
                      style={{
                        fontFamily: "var(--font-replica-mono)",
                        fontSize: "11px",
                      }}
                    >
                      {p.qty} @ avg ${Number(p.avg_entry_price).toFixed(2)} · now ${Number(p.current_price).toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      style={{
                        fontFamily: "var(--font-replica-mono)",
                        fontSize: "16px",
                        color: tone,
                      }}
                    >
                      {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} ({Number(p.unrealized_plpc).toFixed(2)}%)
                    </p>
                    <p
                      className="text-ash"
                      style={{
                        fontFamily: "var(--font-replica-mono)",
                        fontSize: "11px",
                      }}
                    >
                      MV ${Number(p.market_value).toFixed(2)}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
