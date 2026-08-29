// Apply chat_sessions migration via the Supabase service role.
// We split the SQL into statements and execute one at a time using
// the postgres-meta HTTP endpoint, which is exposed on the project
// URL as `/pg/query` for service-role requests.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readFileSync } from "node:fs";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sql = readFileSync("supabase/migrations/2026-08-16_chat_sessions.sql", "utf8");

// First, verify we can reach the project
const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Quick check: does the sessions table already exist?
const probe = await sb.from("chat_sessions").select("id").limit(1);
if (!probe.error) {
  console.log("chat_sessions already exists — skipping DDL");
  process.exit(0);
}
if (probe.error && probe.error.code !== "PGRST205" && probe.error.code !== "42P01") {
  console.error("probe error:", probe.error.code, probe.error.message);
  process.exit(1);
}

// Try the Supabase pg-meta endpoint
const res = await fetch(`${url}/pg/query`, {
  method: "POST",
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: sql }),
});

console.log("status=" + res.status);
const text = await res.text();
console.log("body=" + text.slice(0, 600));

// Verify
const verify = await sb.from("chat_sessions").select("id").limit(1);
console.log("verify=", verify.error ? verify.error.message : "OK");
