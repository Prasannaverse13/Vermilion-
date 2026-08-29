import { getNews, type NewsItem } from "@/lib/alpaca/server";

/**
 * Server-rendered news ticker. Pulls recent headlines for the watchlist
 * via Alpaca's news API. Renders a horizontal strip; if the API
 * returns nothing, the strip stays hidden (no fake content).
 */
export async function NewsTicker({ symbols }: { symbols: string[] }) {
  if (symbols.length === 0) return null;
  let news: NewsItem[] = [];
  try {
    const r = await getNews(symbols, 8);
    news = r.news ?? [];
  } catch {
    return null;
  }
  if (news.length === 0) return null;

  return (
    <div
      className="rounded-cards p-4 mt-5 overflow-hidden"
      style={{ background: "var(--color-tar)", border: "1px solid #1a1a1f" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: "var(--color-bone)" }}
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
          Watchlist news
        </span>
      </div>
      <div
        className="flex gap-4 overflow-x-auto"
        style={{ scrollbarWidth: "thin" }}
      >
        {news.map((n) => (
          <a
            key={n.id}
            href={n.url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-buttons p-3 transition-colors"
            style={{
              background: "#15151a",
              border: "1px solid #1a1a1f",
              maxWidth: "320px",
            }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              {(n.symbols ?? []).slice(0, 2).map((s) => (
                <span
                  key={s}
                  className="px-1.5 py-0.5 rounded-pills text-[9px]"
                  style={{
                    fontFamily: "var(--font-replica-mono)",
                    color: "var(--color-ash)",
                    border: "1px solid var(--color-fog)",
                  }}
                >
                  {s}
                </span>
              ))}
              <span
                className="text-ash"
                style={{
                  fontFamily: "var(--font-replica-mono)",
                  fontSize: "10px",
                }}
              >
                {n.source}
              </span>
            </div>
            <div
              className="text-bone-white"
              style={{ fontSize: "13px", lineHeight: 1.35 }}
            >
              {n.headline}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
