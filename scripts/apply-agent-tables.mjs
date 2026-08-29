// Apply the agent_autonomy migration after the user has pasted
// supabase/snippets/2026-08-19_install_helper.sql into the SQL
// editor (one-time). This calls /api/admin/install-schema on the
// running dev server, which uses the service-role RPC to apply
// each DDL block.
import { config } from "dotenv";
config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url) { console.error("env missing"); process.exit(1); }

// Probe first
const probe = await fetch("http://localhost:3000/api/admin/install-schema", { method: "GET" });
const probeJ = await probe.json();
console.log("probe:", probeJ);
if (!probeJ.helperInstalled) {
  console.log("\nThe vermilion_apply(sql) helper isn't installed yet.");
  console.log("Paste this into the Supabase SQL editor:\n");
  const { readFileSync } = await import("node:fs");
  console.log(readFileSync("supabase/snippets/2026-08-19_install_helper.sql", "utf8"));
  console.log("\nThen run: node scripts/apply-agent-tables.mjs");
  process.exit(1);
}

// Helper is in. Run install.
const r = await fetch("http://localhost:3000/api/admin/install-schema", { method: "POST" });
const j = await r.json();
console.log("install:", j);
if (!j.ok) {
  console.error("install failed");
  process.exit(1);
}
console.log("\nAll autonomy tables installed ✓");
