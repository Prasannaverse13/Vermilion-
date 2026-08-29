"use client";

import { Suspense, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PasswordInput } from "@/app/components/PasswordInput";

/**
 * /signin — wraps the form in a <Suspense> boundary because
 * useSearchParams() must be inside one in Next.js 16+ to avoid a
 * CSR bailout during static generation.
 */
export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/app";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"password" | "magic">("password");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      if (mode === "password") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          setError(error.message);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}${next}` },
        });
        if (error) {
          setError(error.message);
          return;
        }
        setError("Check your email for the magic link.");
        return;
      }
      router.push(next);
      router.refresh();
    });
  };

  return (
    <div
      className="henry-card p-7 md:p-8"
      style={{ padding: "32px" }}
    >
      <p className="eyebrow">sign in</p>
      <h1
        className="text-bone mt-3"
        style={{
          fontSize: "36px",
          lineHeight: 1.05,
          letterSpacing: "-0.025em",
          fontWeight: 300,
        }}
      >
        Welcome back.
      </h1>
      <p
        className="text-ash mt-3"
        style={{ fontSize: "15px", lineHeight: 1.5, letterSpacing: "-0.01em" }}
      >
        Sign in to manage your paper trading agent.
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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
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
          {pending
            ? "Signing in…"
            : mode === "password"
              ? "Sign in →"
              : "Send magic link →"}
        </button>
      </form>

      <div
        className="mt-7 pt-6 flex items-center justify-between text-[13px]"
        style={{ borderTop: "1px solid var(--color-smoke)" }}
      >
        <button
          type="button"
          onClick={() => {
            setError(null);
            setMode((m) => (m === "password" ? "magic" : "password"));
          }}
          className="text-ash hover:text-bone transition-colors"
        >
          {mode === "password"
            ? "Use a magic link"
            : "Use a password"}
        </button>
        <Link href="/signup" className="text-bone hover:underline">
          Create an account →
        </Link>
      </div>
    </div>
  );
}
