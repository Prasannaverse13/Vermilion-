import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Pull the profile row auto-created on signup
  const { data: profile } = await supabase
    .from("profiles")
    .select("name, email, created_at")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  return (
    <div className="px-6 md:px-10">
      <div className="flex items-end justify-between mb-6 mt-6">
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
            Account
          </p>
          <h1
            className="text-bone-white mt-2"
            style={{ fontSize: "40px", lineHeight: 1, letterSpacing: "-0.014em" }}
          >
            Settings
          </h1>
        </div>
        <Link
          href="/app"
          className="text-fog hover:text-bone-white transition-colors text-[13px]"
        >
          ← Back to home
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Profile card */}
        <div
          className="rounded-cards p-6 md:p-7 md:col-span-2"
          style={{ background: "var(--color-graphite)" }}
        >
          <div
            className="text-ash"
            style={{
              fontFamily: "var(--font-replica-mono)",
              fontSize: "11px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Profile
          </div>

          {/* Avatar */}
          <div className="flex items-center gap-4 mt-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-bone-white"
              style={{
                background: "var(--color-indigo-dusk)",
                fontSize: "20px",
                letterSpacing: "-0.01em",
              }}
            >
              {(profile?.name ?? user?.email ?? "?")
                .charAt(0)
                .toUpperCase()}
            </div>
            <div>
              <div
                className="text-bone-white"
                style={{ fontSize: "22px", letterSpacing: "-0.014em" }}
              >
                {profile?.name ?? "—"}
              </div>
              <div
                className="text-fog"
                style={{
                  fontFamily: "var(--font-replica-mono)",
                  fontSize: "13px",
                }}
              >
                {user?.email}
              </div>
            </div>
          </div>

          {/* Info rows */}
          <div className="mt-6 space-y-3">
            <div
              className="flex items-center justify-between py-3"
              style={{ borderTop: "1px solid #1a1a1f" }}
            >
              <span
                className="text-ash"
                style={{
                  fontFamily: "var(--font-replica-mono)",
                  fontSize: "11px",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Email
              </span>
              <span
                className="text-bone-white"
                style={{ fontFamily: "var(--font-replica-mono)", fontSize: "13px" }}
              >
                {user?.email}
              </span>
            </div>
            <div
              className="flex items-center justify-between py-3"
              style={{ borderTop: "1px solid #1a1a1f" }}
            >
              <span
                className="text-ash"
                style={{
                  fontFamily: "var(--font-replica-mono)",
                  fontSize: "11px",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                User ID
              </span>
              <span
                className="text-fog"
                style={{
                  fontFamily: "var(--font-replica-mono)",
                  fontSize: "11px",
                }}
              >
                {user?.id?.slice(0, 8)}…
              </span>
            </div>
            <div
              className="flex items-center justify-between py-3"
              style={{ borderTop: "1px solid #1a1a1f" }}
            >
              <span
                className="text-ash"
                style={{
                  fontFamily: "var(--font-replica-mono)",
                  fontSize: "11px",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Member since
              </span>
              <span
                className="text-bone-white"
                style={{ fontFamily: "var(--font-replica-mono)", fontSize: "13px" }}
              >
                {memberSince}
              </span>
            </div>
            <div
              className="flex items-center justify-between py-3"
              style={{ borderTop: "1px solid #1a1a1f" }}
            >
              <span
                className="text-ash"
                style={{
                  fontFamily: "var(--font-replica-mono)",
                  fontSize: "11px",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Trading mode
              </span>
              <span
                className="inline-flex items-center gap-2 text-bone-white"
                style={{ fontFamily: "var(--font-replica-mono)", fontSize: "12px" }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full live-dot"
                  style={{ background: "var(--color-bone)" }}
                />
                Paper · Alpaca
              </span>
            </div>
          </div>
        </div>

        {/* Danger zone / Sign out card */}
        <div
          className="rounded-cards p-6 md:p-7"
          style={{ background: "var(--color-graphite)" }}
        >
          <div
            className="text-ash"
            style={{
              fontFamily: "var(--font-replica-mono)",
              fontSize: "11px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Session
          </div>
          <h3
            className="text-bone-white mt-3"
            style={{ fontSize: "20px", letterSpacing: "-0.014em" }}
          >
            Sign out
          </h3>
          <p
            className="text-fog mt-2"
            style={{ fontSize: "14px", lineHeight: 1.5 }}
          >
            End your session on this device. Your data is preserved — sign back
            in any time to continue.
          </p>

          <form action="/auth/signout" method="post" className="mt-5">
            <button
              type="submit"
              className="signout-btn inline-flex items-center justify-center gap-2 px-5 py-3 rounded-buttons text-[14px] text-bone-white transition-colors w-full"
            >
              Sign out of Vermilion
            </button>
          </form>

          <div className="mt-6 pt-5" style={{ borderTop: "1px solid #1a1a1f" }}>
            <p
              className="text-ash"
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Build
            </p>
            <p
              className="text-fog mt-1"
              style={{ fontFamily: "var(--font-replica-mono)", fontSize: "12px" }}
            >
              Hackathon demo · v0.1
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
