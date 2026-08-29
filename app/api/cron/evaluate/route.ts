import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAutonomousCycle, STALE_AFTER_MS } from "@/lib/agent/autonomy";
import { createClient as createServiceClient } from "@supabase/supabase-js";

/**
 * POST /api/cron/evaluate
 *
 * Single entry point. Used by:
 *   - Vercel cron (every 15 min, market hours) — `Authorization: Bearer ${CRON_SECRET}`
 *   - The /app manual button — authenticated user via cookie
 *   - The wake-on-visit logic — also authenticated user via cookie
 *
 * In cron mode the request is identified by `?user=<uuid>` and
 * authorized with the `CRON_SECRET` bearer token. Otherwise the
 * request is treated as user-driven and uses the session cookie.
 */

export async function POST(req: Request) {
  const supabase = await createClient();
  let user = (await supabase.auth.getUser()).data.user;

  // Cron mode: identify user via ?user= and authorize via CRON_SECRET.
  if (!user) {
    const url = new URL(req.url);
    const cronUser = url.searchParams.get("user");
    const auth = req.headers.get("authorization") ?? "";
    const cronSecret = process.env.CRON_SECRET ?? "";
    if (
      cronUser &&
      cronSecret &&
      auth === `Bearer ${cronSecret}`
    ) {
      user = { id: cronUser } as unknown as typeof user;
    } else {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isCron = req.headers.get("authorization")?.startsWith("Bearer ") ?? false;
  const result = await runAutonomousCycle({
    userId: user.id,
    triggeredBy: isCron ? "cron" : "manual",
    // Cron mode has no session cookie → use the service-role client so
    // RLS doesn't reject our decisions/chat inserts.
    supabase: isCron
      ? createServiceClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        )
      : undefined,
  });

  return NextResponse.json(result);
}

export const GET = POST;

// Tiny helper route so the frontend can ask "is the agent due?" without
// triggering a full cycle. Returns the last decision age + market state.
// Implemented as GET (not HEAD) so we can return JSON. Mounted at
// /api/agent/status to keep semantics clean.
export async function HEAD() {
  return new NextResponse(null, { status: 405 });
}
