// Smoke test for the MCP server. Sends a few JSON-RPC messages via
// stdio, captures the responses, prints them, and exits 0/1.
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Tiny inline .env loader (matches the one in server.mjs) so we don't
// need to depend on dotenv.
for (const candidate of [
  resolve(__dirname, "../../.env.local"),
  resolve(process.cwd(), ".env.local"),
]) {
  if (!existsSync(candidate)) continue;
  for (const raw of readFileSync(candidate, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
  break;
}

const REQS = [
  { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { jsonrpc: "2.0", id: 2, method: "tools/list" },
  { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "alpaca_get_clock", arguments: {} } },
  { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "alpaca_get_account", arguments: {} } },
  { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "alpaca_get_option_expirations", arguments: { underlying: "AAPL" } } },
  { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "alpaca_get_snapshot", arguments: { symbol: "AAPL" } } },
];

const child = spawn(process.execPath, ["server.mjs"], {
  cwd: __dirname,
  env: process.env,
  stdio: ["pipe", "pipe", "pipe"],
});

let out = "";
let err = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (d) => (out += d));
child.stderr.setEncoding("utf8");
child.stderr.on("data", (d) => (err += d));

child.on("exit", (code) => {
  if (err) process.stderr.write(`[server stderr]\n${err}\n`);
  const lines = out.split("\n").filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch (e) {
      process.stderr.write(`[parse fail] ${l.slice(0, 200)}\n`);
      return null;
    }
  }).filter(Boolean);
  // Debug: dump any error frames
  for (const l of lines) if (l.error) process.stderr.write(`[resp err] id=${l.id} ${l.error.code}: ${l.error.message}\n`);
  for (const line of lines) {
    if (line.id === 2) {
      console.log(`tools/list -> ${line.result.tools.length} tools`);
    } else if (line.id === 3) {
      const text = JSON.parse(line.result.content[0].text);
      console.log(`clock -> is_open=${text.is_open} next_open=${text.next_open} next_close=${text.next_close}`);
    } else if (line.id === 4) {
      const a = JSON.parse(line.result.content[0].text);
      console.log(
        `account -> id=${a.id} status=${a.status} cash=${a.cash} equity=${a.equity} bp=${a.buying_power}`,
      );
    } else if (line.id === 5) {
      if (line.result?.isError) {
        console.log(`option_expirations(AAPL) -> (paper account has no options data: ${line.result.content[0].text.match(/-> (\d+)/)?.[1]})`);
      } else if (line.result) {
        const arr = JSON.parse(line.result.content[0].text);
        console.log(`option_expirations(AAPL) -> ${arr.length} expirations, first 3: ${arr.slice(0, 3).join(", ")}`);
      } else {
        console.log(`option_expirations(AAPL) -> (no result: ${line.error?.message})`);
      }
    } else if (line.id === 6) {
      if (line.result?.isError) {
        console.log(`snapshot(AAPL) -> ERROR: ${line.result.content[0].text}`);
      } else if (line.result) {
        const s = JSON.parse(line.result.content[0].text);
        const last = s.latestTrade?.p ?? s.dailyBar?.c ?? "?";
        console.log(`snapshot(AAPL) -> last_price=$${last}`);
      } else {
        console.log(`snapshot(AAPL) -> (no result: ${line.error?.message})`);
      }
    } else if (line.id === 1) {
      console.log(`initialize -> protocol=${line.result.protocolVersion} server=${line.result.serverInfo.name}@${line.result.serverInfo.version}`);
    } else if (line.error) {
      console.log(`id=${line.id} ERROR ${line.error.code}: ${line.error.message}`);
    } else if (line.result?.isError) {
      console.log(`id=${line.id} TOOL ERR: ${line.result.content[0].text}`);
    }
  }
  process.exit(code ?? 0);
});

for (const r of REQS) child.stdin.write(JSON.stringify(r) + "\n");
// Don't end stdin — let the server process pending fetches, then we
// will exit via a 5-second safety timeout.
setTimeout(() => child.kill("SIGTERM"), 25000);
