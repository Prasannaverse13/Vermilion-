import { readFileSync } from "node:fs";
const sql = readFileSync("supabase/migrations/2026-08-20_human_in_the_loop.sql", "utf8");
const blocks = sql
  .split(/^--\s*-{5,}.*$/m)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !/^--\s*$/.test(s));
const statements = [];
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
console.log(`Total: ${statements.length}`);
statements.forEach((s, i) => {
  console.log(`=== stmt ${i} (len ${s.length}) ===`);
  console.log(s);
  console.log();
});
