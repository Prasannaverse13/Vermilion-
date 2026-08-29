// Probe what HTTP paths are reachable on the Supabase project
import { config } from "dotenv";
config({ path: ".env.local" });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = {
  apikey: service,
  Authorization: `Bearer ${service}`,
  "Content-Type": "application/json",
};
const candidates = [
  ["POST", "/pg/query", { query: "select 1" }],
  ["POST", "/pg", { query: "select 1" }],
  ["POST", "/rest/v1/rpc", { query: "select 1" }],
  ["GET", "/rest/v1/", null],
  ["GET", "/pg/", null],
  ["GET", "/", null],
];
for (const [m, p, body] of candidates) {
  try {
    const r = await fetch(url + p, { method: m, headers, body: body ? JSON.stringify(body) : undefined });
    const t = (await r.text()).slice(0, 200);
    console.log(`${m} ${p} → ${r.status}  ${t.replace(/\n/g," ")}`);
  } catch (e) {
    console.log(`${m} ${p} → ERR ${e.message}`);
  }
}
