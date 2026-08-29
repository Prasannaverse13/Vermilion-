"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PasswordInput } from "@/app/components/PasswordInput";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: `${window.location.origin}/app`,
        },
      });
      if (error) {
        setError(error.message);
        return;
      }
      // Supabase sends a confirmation email by default. If you disable
      // email confirmation in the Supabase dashboard, the user is
      // signed in immediately and we send them to /app.
      router.push("/app");
      router.refresh();
    });
  };

  return (
    <div className="henry-card" style={{ padding: "32px" }}>
      <p className="eyebrow">get started</p>
      <h1
        className="text-bone mt-3"
        style={{
          fontSize: "36px",
          lineHeight: 1.05,
          letterSpacing: "-0.025em",
          fontWeight: 300,
        }}
      >
        Create your account.
      </h1>
      <p
        className="text-ash mt-3"
        style={{ fontSize: "15px", lineHeight: 1.5, letterSpacing: "-0.01em" }}
      >
        Free for the hackathon. You get a paper trading account and a
        self-auditing agent.
      </p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span
            className="text-ash"
            style={{
              fontFamily: "var(--font-replica-mono)",
              fontSize: "10px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Name
          </span>
          <input
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full px-4 py-3 text-bone outline-none focus:ring-1 transition-all"
            style={{
              background: "var(--color-tar)",
              border: "1px solid var(--color-smoke)",
              borderRadius: 6,
              fontSize: "15px",
              letterSpacing: "-0.01em",
            }}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span
            className="text-ash"
            style={{
              fontFamily: "var(--font-replica-mono)",
              fontSize: "10px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Email
          </span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="w-full px-4 py-3 text-bone outline-none focus:ring-1 transition-all"
            style={{
              background: "var(--color-tar)",
              border: "1px solid var(--color-smoke)",
              borderRadius: 6,
              fontSize: "15px",
              letterSpacing: "-0.01em",
            }}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span
            className="text-ash"
            style={{
              fontFamily: "var(--font-replica-mono)",
              fontSize: "10px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Password
          </span>
          <PasswordInput
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <span className="text-ash" style={{ fontSize: "12px" }}>
            At least 6 characters.
          </span>
        </label>

        {error && (
          <p
            className="text-[13px]"
            style={{ color: "var(--color-refuse)" }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="pill-primary w-full justify-center disabled:opacity-50 mt-2"
          style={{ padding: "12px 24px", fontSize: "14px" }}
        >
          {pending ? "Creating account…" : "Create account →"}
        </button>
      </form>

      <p
        className="mt-7 pt-6 text-ash text-[13px]"
        style={{ borderTop: "1px solid var(--color-smoke)" }}
      >
        By creating an account, you agree to the hackathon's terms. Already
        have one?{" "}
        <Link href="/signin" className="text-bone hover:underline">
          Sign in
        </Link>
        .
      </p>
    </div>
  );
}
