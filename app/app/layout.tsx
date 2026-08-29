import Link from "next/link";
import { LiveTicker } from "../components/LiveTicker";
import { OnboardingTour } from "../components/OnboardingTour";
import { createClient } from "@/lib/supabase/server";

/**
 * App shell — wraps every /app/* route with the live ticker and the
 * dashboard nav. The proxy already gated the /app prefix, so by the
 * time this layout runs, the user is authenticated.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <LiveTicker />
      <OnboardingTour />
      <main
        className="w-full mx-auto relative z-10"
        style={{ maxWidth: "var(--page-max-width)" }}
      >
        <nav className="w-full px-6 md:px-10 py-5 flex items-center text-[14px]">
          <Link
            href="/app"
            className="text-bone tracking-[-0.02em]"
            style={{ fontWeight: 500 }}
          >
            vermilion
          </Link>
          <span className="ml-8 text-ash hidden md:inline">
            self-auditing trading agent
          </span>
          <div className="ml-auto flex items-center gap-3 md:gap-5">
            {user?.email && (
              <span
                className="text-fog hidden md:inline"
                style={{
                  fontFamily: "var(--font-replica-mono)",
                  fontSize: "12px",
                }}
              >
                {user.email}
              </span>
            )}
            <Link
              href="/app/watchlist"
              className="text-fog hover:text-bone-white transition-colors hidden md:inline"
            >
              Watchlist
            </Link>
            <Link
              href="/app/decisions"
              className="text-fog hover:text-bone-white transition-colors hidden md:inline"
            >
              Decisions
            </Link>
            <Link
              href="/app/portfolio"
              className="text-fog hover:text-bone-white transition-colors hidden md:inline"
            >
              Portfolio
            </Link>
            <Link
              href="/app/goals"
              className="text-fog hover:text-bone-white transition-colors hidden md:inline"
            >
              Goals
            </Link>
            <Link
              href="/app/activity"
              className="text-fog hover:text-bone-white transition-colors hidden md:inline"
            >
              Activity
            </Link>
            <Link
              href="/app/queue"
              className="text-fog hover:text-bone-white transition-colors hidden md:inline"
            >
              Queue
            </Link>
            <Link
              href="/app/chat"
              className="text-fog hover:text-bone-white transition-colors hidden md:inline"
            >
              Chat
            </Link>
            <Link
              href="/app/settings"
              className="text-fog hover:text-bone-white transition-colors hidden md:inline"
            >
              Settings
            </Link>
            <span
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-pills text-[12px]"
              style={{
                background: "var(--color-bone)",
                color: "var(--color-obsidian)",
                fontWeight: 600,
                letterSpacing: "0.01em",
                boxShadow: "0 0 0 1px rgba(212, 208, 201, 0.18), 0 0 12px rgba(212, 208, 201, 0.12)",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full live-dot"
                style={{ background: "var(--color-execute)" }}
              />
              Live · Paper
            </span>
          </div>
        </nav>
        {children}
      </main>
    </>
  );
}
