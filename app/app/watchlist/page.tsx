import Link from "next/link";
import { Reveal } from "@/app/components/Reveal";
import { WatchlistManager } from "@/app/components/WatchlistManager";
import { createClient } from "@/lib/supabase/server";

type WatchItem = {
  id: string;
  symbol: string;
  source: "agent" | "user";
  added_at: string;
};

export default async function WatchlistPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("watchlist")
    .select("id, symbol, source, added_at")
    .eq("user_id", user?.id ?? "00000000-0000-0000-0000-000000000000")
    .order("source", { ascending: true })
    .order("added_at", { ascending: true });

  const items: WatchItem[] = data ?? [];
  const agentCount = items.filter((i) => i.source === "agent").length;
  const userCount = items.filter((i) => i.source === "user").length;

  return (
    <div className="px-6 md:px-10">
      <Reveal>
        <div className="w-full pt-6 md:pt-8 pb-2 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-4 flex-wrap">
            <span
              className="text-ash"
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "11px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Watchlist · {user?.email ?? ""}
            </span>
          </div>
          <Link
            href="/app"
            className="text-fog hover:text-bone-white transition-colors text-[13px]"
          >
            ← Back to dashboard
          </Link>
        </div>
      </Reveal>

      <Reveal>
        <div className="mt-8">
          <h1
            className="text-bone-white"
            style={{ fontSize: "44px", lineHeight: 1.05, letterSpacing: "-0.02em" }}
          >
            Watchlist
          </h1>
          <p
            className="text-fog mt-3 max-w-2xl"
            style={{ fontSize: "16px", lineHeight: 1.5 }}
          >
            The agent runs its evaluation cycle over this list. Vermilion ships
            with 13 default names you can't remove; add or remove your own picks
            below.
          </p>
        </div>
      </Reveal>

      <Reveal>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
          <div
            className="rounded-cards p-5"
            style={{ background: "var(--color-graphite)" }}
          >
            <div
              className="text-ash"
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Total
            </div>
            <div
              className="text-bone-white mt-2"
              style={{ fontSize: "32px", lineHeight: 1 }}
            >
              {items.length}
            </div>
          </div>
          <div
            className="rounded-cards p-5"
            style={{ background: "var(--color-graphite)" }}
          >
            <div
              className="text-ash"
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Agent defaults
            </div>
            <div
              className="mt-2"
              style={{ fontSize: "32px", lineHeight: 1, color: "var(--color-bone)" }}
            >
              {agentCount}
            </div>
          </div>
          <div
            className="rounded-cards p-5"
            style={{ background: "var(--color-graphite)" }}
          >
            <div
              className="text-ash"
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Your picks
            </div>
            <div
              className="mt-2"
              style={{ fontSize: "32px", lineHeight: 1, color: "#9fd9b4" }}
            >
              {userCount}
            </div>
          </div>
          <div
            className="rounded-cards p-5"
            style={{ background: "var(--color-graphite)" }}
          >
            <div
              className="text-ash"
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Cap
            </div>
            <div
              className="text-bone-white mt-2"
              style={{ fontSize: "32px", lineHeight: 1 }}
            >
              20
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal>
        <div className="mt-8">
          <WatchlistManager initial={items} />
        </div>
      </Reveal>
    </div>
  );
}
