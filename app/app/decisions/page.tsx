import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DecisionsList } from "@/app/components/DecisionsList";

type Decision = {
  id: string;
  symbol: string;
  action: string;
  refused: boolean;
  confidence: number | null;
  threshold: number;
  reasoning: string | null;
  sources: { tag: string; text: string }[] | null;
  qty: number | null;
  price: number | null;
  created_at: string;
};

export default async function DecisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; symbol?: string }>;
}) {
  const supabase = await createClient();
  const { filter = "all", symbol = "" } = await searchParams;

  let q = supabase
    .from("decisions")
    .select("id, symbol, action, refused, confidence, threshold, reasoning, sources, qty, price, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter === "refused") q = q.eq("refused", true);
  if (filter === "executed") q = q.eq("refused", false);
  if (symbol) q = q.eq("symbol", symbol.toUpperCase());

  const { data } = await q;
  const decisions: Decision[] = data ?? [];
  const symbols = Array.from(new Set(decisions.map((d) => d.symbol))).sort();

  const executed = decisions.filter((d) => !d.refused).length;
  const refused = decisions.length - executed;

  return (
    <div className="px-6 md:px-10">
      <div className="flex items-end justify-between mb-6 mt-6 flex-wrap gap-3">
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
            Audit log
          </p>
          <h1
            className="text-bone-white mt-2"
            style={{ fontSize: "40px", lineHeight: 1, letterSpacing: "-0.014em" }}
          >
            All decisions
          </h1>
        </div>
        <div className="flex items-center gap-4 text-[13px] flex-wrap">
          <span className="text-fog" style={{ fontFamily: "var(--font-replica-mono)" }}>
            {executed} executed
          </span>
          <span className="text-ash">·</span>
          <span className="text-fog" style={{ fontFamily: "var(--font-replica-mono)" }}>
            {refused} refused
          </span>
          <span className="text-ash">·</span>
          <span className="text-fog" style={{ fontFamily: "var(--font-replica-mono)" }}>
            {decisions.length} shown
          </span>
        </div>
      </div>

      <Link
        href="/app"
        className="text-fog hover:text-bone-white transition-colors text-[13px]"
      >
        ← Back to home
      </Link>

      <DecisionsList
        decisions={decisions}
        symbols={symbols}
        activeFilter={filter}
        activeSymbol={symbol}
      />
    </div>
  );
}
