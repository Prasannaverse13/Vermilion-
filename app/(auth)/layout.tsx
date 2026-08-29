import Link from "next/link";

/**
 * Auth shell — shared layout for /signin and /signup.
 * Renders the Henry-style obsidian canvas, a small back link, and
 * a centered card slot for the auth form.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen w-full flex flex-col relative z-10"
      style={{ background: "var(--color-obsidian)" }}
    >
      {/* Top mini-nav: just brand + "back to home" */}
      <div className="w-full px-6 md:px-10 py-5 flex items-center text-[14px]">
        <Link
          href="/"
          className="text-bone tracking-[-0.02em]"
          style={{ fontWeight: 500 }}
        >
          vermilion
        </Link>
        <Link
          href="/"
          className="ml-auto text-ash hover:text-bone transition-colors"
        >
          ← Back to home
        </Link>
      </div>

      {/* Centered card slot */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">{children}</div>
      </div>

      {/* Footer note */}
      <div className="w-full px-6 md:px-10 py-6 text-ash text-[12px] text-center">
        self-auditing trading agent · built for the{" "}
        <Link
          href="https://lablab.ai/ai-hackathons/alpaca-ai-trading-agents-hackathon"
          target="_blank"
          className="text-bone hover:underline"
        >
          Alpaca AI Trading Agents Hackathon
        </Link>
      </div>
    </div>
  );
}
