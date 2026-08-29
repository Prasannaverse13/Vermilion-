import Link from "next/link";
import Image from "next/image";
import { HeroHeadline } from "./components/AnimatedMural";
import { ProductMockup } from "./components/ProductMockup";
import { Reveal } from "./components/Reveal";

/**
 * Landing page (/) — marketing, not the product.
 * Henry-style: whisper-light display headline + product artifact
 * floating behind it, warm-gray section tags, 100px pill CTAs.
 */

const features = [
  {
    n: "01",
    title: "Runs on its own",
    body: "Wakes on the cron, on stale data, and on visit. Writes a morning brief, runs a self-audit at close, and posts a daily reflection. No human in the loop.",
  },
  {
    n: "02",
    title: "Refuses by default",
    body: "Every trade must clear a 60% confidence threshold. The default answer is no. The agent has to make a case.",
  },
  {
    n: "03",
    title: "Explains every decision",
    body: "Live bid/ask, intraday volume, fundamentals, the agent's own past self on the same name. The reasoning chain is surfaced inline, never hidden.",
  },
  {
    n: "04",
    title: "Immutable audit log",
    body: "Every evaluation — refused or executed — is timestamped and recoverable. No edits, no deletes, ever. A complete history of what the agent did and why.",
  },
  {
    n: "05",
    title: "Long-running theses",
    body: "Vermilion opens a plan when it sees something worth committing to — a range-bound ticker, an earnings hedge, a watchlist expansion — and tracks progress over time.",
  },
  {
    n: "06",
    title: "User-confirmed trades",
    body: "Chat can propose. You confirm. Nothing executes without your click. Same gates, second signer.",
  },
];

const integrations = [
  "Alpaca", "DeepSeek", "Supabase", "Vercel",
];

function Nav() {
  return (
    <nav className="w-full px-6 md:px-10 py-5 flex items-center text-[14px]">
      <Link href="/" className="text-bone tracking-[-0.02em]" style={{ fontWeight: 500 }}>
        vermilion
      </Link>
      <span className="ml-8 text-ash hidden md:inline">
        self-auditing trading agent
      </span>
      <div className="ml-auto flex items-center gap-2">
        <Link href="/signin" className="px-4 py-2 text-ash hover:text-bone transition-colors">
          Sign in
        </Link>
        <Link href="/signup" className="pill-primary">
          Get started
        </Link>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="w-full relative">
      {/* Full-bleed landscape photograph — the system's single dramatic
          image, per the Henry brief. Sits behind the headline + mockup
          with a dark scrim for legibility. */}
      <div
        className="relative w-full overflow-hidden"
        style={{ height: "min(92vh, 880px)" }}
      >
        <Image
          src="/hero.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          style={{ objectFit: "cover", objectPosition: "center 60%" }}
        />
        {/* Dark scrim — a vertical gradient that lets the photo breathe
            at the top and gets darker toward the bottom for text contrast. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0.78) 100%)",
          }}
          aria-hidden
        />
        {/* Subtle radial darken at the left so the headline pops */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(80% 70% at 30% 50%, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 60%)",
          }}
          aria-hidden
        />

        <div className="relative z-10 h-full px-6 md:px-10 pt-20 md:pt-32 pb-12 flex flex-col">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 items-center flex-1">
            <div className="md:col-span-7">
              <p className="eyebrow mb-6 text-chalk">
                self-auditing trading agent · alpaca
              </p>
              <HeroHeadline />
              <p
                className="mt-8 max-w-xl"
                style={{
                  fontSize: "18px",
                  lineHeight: 1.4,
                  letterSpacing: "-0.02em",
                  fontWeight: 400,
                  color: "rgba(242, 242, 243, 0.85)",
                }}
              >
                Vermilion is a paper-trading agent on Alpaca. Every decision
                — to trade or to refuse — comes with its full reasoning
                chain. If confidence is too low, Vermilion says no, and
                tells you why.
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Link href="/signup" className="pill-primary">
                  Get started →
                </Link>
                <Link href="/signin" className="pill-ghost">
                  I already have an account
                </Link>
              </div>
            </div>

            <div className="md:col-span-5 hidden md:block">
              <ProductMockup />
            </div>
          </div>
        </div>
      </div>

      {/* Quick stats strip — three numbers, big, no chrome */}
      <div className="px-6 md:px-10 mt-16 md:mt-20 grid grid-cols-3 gap-6 md:gap-10 border-t border-smoke pt-10">
        {[
          { n: "13", label: "symbols watched" },
          { n: "60%", label: "confidence threshold" },
          { n: "8%", label: "max position size" },
        ].map((s) => (
          <div key={s.label}>
            <div
              className="text-chalk font-light"
              style={{
                fontSize: "clamp(36px, 4vw, 48px)",
                lineHeight: 1,
                letterSpacing: "-0.025em",
              }}
            >
              {s.n}
            </div>
            <div
              className="text-ash mt-2"
              style={{ fontSize: "13px", letterSpacing: "-0.01em" }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Integration row — full width, logos spaced, no chrome */}
      <div className="px-6 md:px-10 mt-14 flex items-center flex-wrap gap-x-12 gap-y-4">
        <span className="eyebrow">integrations</span>
        <div className="flex items-center flex-wrap gap-x-10 gap-y-2 text-ash">
          {integrations.map((i) => (
            <span key={i} style={{ fontWeight: 500, letterSpacing: "-0.02em", fontSize: "15px" }}>
              {i}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="henry-card p-6">
      <div className="eyebrow">{n}</div>
      <h3
        className="text-bone mt-4"
        style={{
          fontSize: "22px",
          lineHeight: 1.2,
          letterSpacing: "-0.02em",
          fontWeight: 400,
        }}
      >
        {title}
      </h3>
      <p
        className="text-ash mt-3"
        style={{ fontSize: "15px", lineHeight: 1.5, letterSpacing: "-0.01em" }}
      >
        {body}
      </p>
    </div>
  );
}

function AutonomyProof() {
  return (
    <section
      className="w-full px-6 md:px-10 mt-24 md:mt-32"
      aria-label="Autonomy in action"
    >
      <p className="eyebrow text-center">autonomy</p>
      <h2
        className="text-chalk font-light text-center mx-auto mt-4 max-w-3xl"
        style={{
          fontSize: "clamp(36px, 5vw, 64px)",
          lineHeight: 1.0,
          letterSpacing: "-0.025em",
        }}
      >
        An agent that shows up working.
      </h2>
      <p
        className="text-ash text-center mx-auto mt-5 max-w-2xl"
        style={{ fontSize: "16px", lineHeight: 1.5, letterSpacing: "-0.01em" }}
      >
        Vermilion is not a button. It wakes itself, evaluates your
        watchlist against the live market, and writes down what it
        did and why — every time, on its own schedule.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-12">
        <ProofCard
          time="09:35 ET"
          title="Morning brief"
          body="A pre-market self-prompt. What the agent's watching, what it already refused, the news on the radar."
        />
        <ProofCard
          time="every 15 min"
          title="Cycle"
          body="Quotes for the watchlist, DeepSeek scores every name, refuses by default, places orders above 60% confidence."
        />
        <ProofCard
          time="16:10 ET"
          title="Reflection"
          body="End-of-day self-audit. Wins, misses, and what the agent will do differently tomorrow. Persisted to the audit log."
        />
      </div>
    </section>
  );
}

function ProofCard({ time, title, body }: { time: string; title: string; body: string }) {
  return (
    <article
      className="rounded-cards p-6 md:p-7 h-full"
      style={{ background: "var(--color-tar)", border: "1px solid #1a1a1f" }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: "var(--color-execute)",
            boxShadow: "0 0 0 3px rgba(31, 226, 116, 0.18)",
            animation: "pulse 1.6s ease-in-out infinite",
          }}
        />
        <span
          className="text-ash"
          style={{
            fontFamily: "var(--font-replica-mono)",
            fontSize: "10px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {time}
        </span>
      </div>
      <h3
        className="text-bone-white"
        style={{ fontSize: "20px", letterSpacing: "-0.014em", fontWeight: 500 }}
      >
        {title}
      </h3>
      <p
        className="text-fog mt-3"
        style={{ fontSize: "14px", lineHeight: 1.55 }}
      >
        {body}
      </p>
    </article>
  );
}

function Features() {
  return (
    <section className="w-full px-6 md:px-10 mt-24 md:mt-32">
      <p className="eyebrow text-center">skill</p>
      <h2
        className="text-chalk font-light text-center mx-auto mt-4 max-w-2xl"
        style={{
          fontSize: "clamp(36px, 5vw, 64px)",
          lineHeight: 1.0,
          letterSpacing: "-0.025em",
        }}
      >
        How Vermilion thinks
      </h2>
      <p
        className="text-ash text-center mx-auto mt-5 max-w-xl"
        style={{ fontSize: "16px", lineHeight: 1.5, letterSpacing: "-0.01em" }}
      >
        Three disciplines applied to every market decision.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-10">
        {features.map((f) => (
          <FeatureCard key={f.n} {...f} />
        ))}
      </div>
    </section>
  );
}

function StatCard({ n, label, barClass }: { n: string; label: string; barClass: string }) {
  return (
    <div className="relative pl-4">
      <div
        className={`absolute left-0 top-0 bottom-0 w-[3px] ${barClass}`}
        aria-hidden
      />
      <div
        className="text-chalk"
        style={{
          fontSize: "clamp(40px, 4.5vw, 56px)",
          lineHeight: 1,
          letterSpacing: "-0.025em",
          fontWeight: 400,
        }}
      >
        {n}
      </div>
      <p
        className="text-bone mt-3"
        style={{ fontSize: "15px", lineHeight: 1.4, letterSpacing: "-0.01em" }}
      >
        {label}
      </p>
    </div>
  );
}

function Proof() {
  return (
    <section className="w-full px-6 md:px-10 mt-24 md:mt-32">
      <p className="eyebrow text-center">proof</p>
      <h2
        className="text-chalk font-light text-center mx-auto mt-4 max-w-2xl"
        style={{
          fontSize: "clamp(36px, 5vw, 64px)",
          lineHeight: 1.0,
          letterSpacing: "-0.025em",
        }}
      >
        By the numbers
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mt-14">
        <StatCard n="100%" label="Of decisions are auditable, refused or executed" barClass="stat-bar-execute" />
        <StatCard n="60%" label="Confidence threshold for execution (configurable)" barClass="stat-bar-caution" />
        <StatCard n="8%" label="Maximum position size per name, per cycle" barClass="stat-bar-refuse" />
      </div>
    </section>
  );
}

function CTABand() {
  return (
    <section className="w-full px-6 md:px-10 mt-24 md:mt-32">
      <div className="henry-card p-8 md:p-12 text-center">
        <p className="eyebrow">ready</p>
        <h2
          className="text-chalk font-light mx-auto mt-4 max-w-2xl"
          style={{
            fontSize: "clamp(32px, 4vw, 48px)",
            lineHeight: 1.05,
            letterSpacing: "-0.025em",
          }}
        >
          Run a paper account.
          <br />
          See the agent decide.
        </h2>
        <p
          className="text-ash mx-auto mt-5 max-w-md"
          style={{ fontSize: "15px", lineHeight: 1.5, letterSpacing: "-0.01em" }}
        >
          Free for the duration of the Alpaca AI Trading Agents Hackathon.
          No credit card, no real money at risk.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/signup" className="pill-primary">
            Get started →
          </Link>
          <Link href="/signin" className="pill-ghost">
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="w-full mt-24 md:mt-32 px-6 md:px-10 py-10">
      <div
        className="mb-8"
        style={{ height: 1, background: "var(--color-smoke)", width: "100%" }}
      />
      <div className="flex flex-wrap items-center gap-4 justify-between text-ash text-[14px]">
        <div>
          <span className="text-bone" style={{ fontWeight: 500 }}>vermilion</span>
          {" "}· self-auditing trading agent · built for the{" "}
          <Link
            href="https://lablab.ai/ai-hackathons/alpaca-ai-trading-agents-hackathon"
            target="_blank"
            className="text-bone hover:underline"
          >
            Alpaca AI Trading Agents Hackathon
          </Link>
        </div>
        <div className="text-smoke">
          © 2026
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <main
      className="w-full mx-auto relative z-10"
      style={{ maxWidth: "var(--page-max-width)" }}
    >
      <Nav />
      <Reveal>
        <Hero />
      </Reveal>
      <Reveal>
        <AutonomyProof />
      </Reveal>
      <Reveal>
        <Features />
      </Reveal>
      <Reveal>
        <Proof />
      </Reveal>
      <Reveal>
        <CTABand />
      </Reveal>
      <Footer />
    </main>
  );
}
