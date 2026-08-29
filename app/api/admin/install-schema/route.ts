import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * POST /api/admin/install-schema
 *
 * Applies any pending migration in supabase/migrations/ by calling the
 * service-role `vermilion_apply(text)` function. Requires the helper
 * function to already exist in the database (one-time paste in the
 * SQL editor). All migrations are idempotent so re-running is safe.
 */

const SERVICE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Split a SQL file into individual statements. Strategy:
 *   1. Strip the section-divider comment lines AND the descriptive
 *      text under them up to the first blank line. The dividers look
 *      like:
 *          -- ----- user_goals -----
 *          -- One row per user. Created lazily on first /api/agent/goals call.
 *          -- (more text)
 *                       <-- blank line ends the header
 *   2. Within each block, split on top-level `;` boundaries, but keep
 *      `$$ ... $$` dollar-quoted blocks intact.
 */
function splitSql(sql: string): string[] {
  // Pass 1: remove the section dividers and their accompanying comment
  // text. A divider is a line starting with `-- -----` and the
  // descriptive text is the consecutive run of `-- ...` lines that
  // follows, terminated by a blank line or a non-`--` line.
  const cleaned = sql.replace(
    /--\s*-{5,}[^\n]*\n(?:--[^\n]*\n)*/g,
    (m) => {
      // Keep just the trailing newline so we don't lose spacing.
      return "\n";
    },
  );

  // Pass 2: split on boundary markers (any remaining `-- -----` lines).
  const blocks = cleaned
    .split(/^--\s*-{5,}.*$/m)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^--\s*$/.test(s));

  // Pass 3: within each block, split on `;` at top level (i.e. not
  // inside `$$ ... $$`). The result is a list of single statements,
  // each ending in `;`.
  const statements: string[] = [];
  for (const block of blocks) {
    let depth = 0;
    let buf = "";
    for (let i = 0; i < block.length; i++) {
      const ch = block[i];
      const next = block[i + 1];
      if (ch === "$" && next === "$") {
        depth++;
        buf += "$$";
        i++;
        continue;
      }
      if (ch === ";" && depth === 0) {
        buf += ";";
        const stmt = buf.trim();
        if (stmt.length > 1) statements.push(stmt);
        buf = "";
        continue;
      }
      buf += ch;
    }
    const tail = buf.trim();
    if (tail.length > 0) statements.push(tail);
  }
  return statements;
}

export async function POST() {
  if (!SERVICE_URL || !SERVICE_KEY) {
    return NextResponse.json(
      { error: "service_role env missing" },
      { status: 500 },
    );
  }

  const service = createClient(SERVICE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // First, check if the helper exists.
  const probe = await service.rpc("vermilion_apply", { sql: "select 1" });
  if (probe.error) {
    return NextResponse.json(
      {
        error: "helper_missing",
        message:
          "The vermilion_apply function is not installed yet. Paste supabase/snippets/2026-08-19_install_helper.sql into the Supabase SQL editor, then call this endpoint again.",
        detail: probe.error.message,
      },
      { status: 412 },
    );
  }

  // Walk every .sql file in migrations/ in lexicographic order and run
  // each as one statement. Each migration is hand-authored to be
  // idempotent (create-if-not-exists, drop-policy-if-exists) so we
  // don't need to split further. If a migration has multiple DDL
  // blocks separated by `-- ----- name -----` lines, the helper's
  // plpgsql execute can handle them as one because the DO blocks and
  // CREATE statements are self-terminating with semicolons.
  //
  // BUT: for the 2026-08-19 file (which uses `$$ ... $$` DO blocks)
  // we need to split because the helper runs `execute sql` which
  // can't be a multi-statement string. So we still split, but on a
  // robust boundary.
  const dir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const results: { file: string; idx: number; ok: boolean; message: string }[] = [];

  // Boundary regex: a line that is exactly `-- -----` (with optional
  // surrounding table-name text) and acts as a section divider. We
  // additionally split any file on `;\n\n` as a fallback (multiple
  // top-level CREATE statements).
  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf8");
    const statements = splitSql(sql);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      // Each statement is now a single `;`-terminated command. Pass
      // straight to vermilion_apply's `execute sql`.
      const r = await service.rpc("vermilion_apply", { sql: stmt });
      if (r.error) {
        results.push({ file, idx: i, ok: false, message: r.error.message });
      } else {
        const out = (r.data ?? "") as string;
        results.push({ file, idx: i, ok: out === "ok", message: out });
      }
    }
  }

  const failed = results.filter((r) => !r.ok);
  return NextResponse.json({
    ok: failed.length === 0,
    statements: results.length,
    failed: failed.length,
    results,
  });
}

export async function GET() {
  if (!SERVICE_URL || !SERVICE_KEY) {
    return NextResponse.json({ error: "service_role env missing" }, { status: 500 });
  }
  const service = createClient(SERVICE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const probe = await service.rpc("vermilion_apply", { sql: "select 1" });
  return NextResponse.json({
    helperInstalled: !probe.error,
    helperError: probe.error?.message ?? null,
  });
}
