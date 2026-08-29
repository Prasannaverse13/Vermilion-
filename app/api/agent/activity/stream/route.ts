import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/agent/activity/stream
 *
 * Server-Sent Events stream of new agent_activity rows. Polls the
 * table every 3s and emits any row with id > lastSeen. Heartbeat
 * ping every 15s so reverse proxies don't time out.
 *
 * The client uses `new EventSource("/api/agent/activity/stream")`
 * and listens for `activity` events.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let lastId: string | null = null;
      let alive = true;

      const send = (event: string, data: unknown) => {
        if (!alive) return;
        try {
          controller.enqueue(
            enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          alive = false;
        }
      };

      // Initial sync — emit the most recent id we know about
      const { data: latest } = await supabase
        .from("agent_activity")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      lastId = latest?.id ?? null;

      // Poll loop
      const tick = async () => {
        if (!alive) return;
        try {
          let q = supabase
            .from("agent_activity")
            .select("id, kind, title, detail, symbols, meta, created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(20);
          if (lastId) {
            // Fetch only newer than what we have. We use a timestamp
            // cutoff because id > lastId would need a custom operator
            // and uuid ordering isn't reliable.
            const { data: last } = await supabase
              .from("agent_activity")
              .select("created_at")
              .eq("id", lastId)
              .maybeSingle();
            if (last?.created_at) {
              q = q.gt("created_at", last.created_at);
            }
          }
          const { data: rows } = await q;
          if (rows && rows.length) {
            // Emit oldest first so the client can prepend in order.
            for (const r of rows.reverse()) {
              send("activity", r);
              lastId = r.id;
            }
          }
        } catch {
          /* keep the stream alive */
        }
      };

      const poll = setInterval(tick, 3000);
      const heartbeat = setInterval(() => send("ping", { ts: Date.now() }), 15_000);

      // Cleanup on close
      const close = () => {
        alive = false;
        clearInterval(poll);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      // The request signal isn't available directly, but the runtime
      // will close the stream when the client disconnects; reaching
      // into the abort signal keeps the process tidy.
      (controller as unknown as { _close?: () => void })._close = close;
    },
    cancel() {
      // The reader disconnected; the closures above will eventually
      // notice via the `alive` flag in subsequent ticks.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
