import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
// pdf-parse's default entry tries to read a test file on import — load the
// implementation directly to dodge that.
import * as pdfParseMod from "pdf-parse";
const pdfParse = (pdfParseMod as any).default ?? pdfParseMod;

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/chat/parse
 * multipart/form-data with `file` field.
 *
 * Returns { ok, name, kind, text, meta } where:
 *   - kind: 'csv' | 'xlsx' | 'docx' | 'pdf' | 'text' | 'image'
 *   - text: extracted plain text (truncated to 60k chars)
 *   - meta: optional structured info (sheet names, row/col counts, etc.)
 *
 * Auth-gated so anonymous users can't burn CPU. 10MB upload cap.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "no file" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "file too large (10MB max)" }, { status: 413 });
  }

  const name = file.name || "upload";
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const buf = Buffer.from(await file.arrayBuffer());

  try {
    if (ext === "csv" || ext === "tsv") {
      const text = buf.toString("utf8");
      const lines = text.split(/\r?\n/);
      const preview = lines.slice(0, 30).join("\n");
      return NextResponse.json({
        ok: true,
        name,
        kind: "csv",
        text: text.length > 60000 ? text.slice(0, 60000) + "\n…(truncated)" : text,
        meta: { rows: lines.length, cols: lines[0]?.split(",").length ?? 0, preview },
      });
    }
    if (ext === "xlsx" || ext === "xls") {
      const wb = XLSX.read(buf, { type: "buffer" });
      const sheets: Record<string, string> = {};
      let totalRows = 0;
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(ws);
        sheets[sheetName] = csv;
        totalRows += csv.split(/\n/).length;
      }
      const text = Object.entries(sheets)
        .map(([n, c]) => `### Sheet: ${n}\n${c}`)
        .join("\n\n");
      return NextResponse.json({
        ok: true,
        name,
        kind: "xlsx",
        text: text.length > 60000 ? text.slice(0, 60000) + "\n…(truncated)" : text,
        meta: { sheets: wb.SheetNames, totalRows, sheetCount: wb.SheetNames.length },
      });
    }
    if (ext === "docx") {
      const r = await mammoth.extractRawText({ buffer: buf });
      return NextResponse.json({
        ok: true,
        name,
        kind: "docx",
        text:
          r.value.length > 60000
            ? r.value.slice(0, 60000) + "\n…(truncated)"
            : r.value,
        meta: { messages: r.messages.length },
      });
    }
    if (ext === "pdf") {
      const r = await pdfParse(buf);
      return NextResponse.json({
        ok: true,
        name,
        kind: "pdf",
        text:
          r.text.length > 60000
            ? r.text.slice(0, 60000) + "\n…(truncated)"
            : r.text,
        meta: { pages: r.numpages, info: r.info },
      });
    }
    if (ext === "json") {
      const text = buf.toString("utf8");
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* keep raw */ }
      return NextResponse.json({
        ok: true,
        name,
        kind: "text",
        text: pretty.length > 60000 ? pretty.slice(0, 60000) + "\n…(truncated)" : pretty,
        meta: {},
      });
    }
    if (["txt", "md", "markdown", "log"].includes(ext)) {
      const text = buf.toString("utf8");
      return NextResponse.json({
        ok: true,
        name,
        kind: "text",
        text: text.length > 60000 ? text.slice(0, 60000) + "\n…(truncated)" : text,
        meta: {},
      });
    }
    if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
      // No OCR in this build — just acknowledge. Future: Tesseract.js
      return NextResponse.json({
        ok: true,
        name,
        kind: "image",
        text: `[Image attached: ${name} (${(file.size / 1024).toFixed(1)} KB). OCR not enabled in this build.]`,
        meta: { size: file.size, mime: file.type },
      });
    }
    return NextResponse.json(
      { error: `unsupported file type: .${ext}` },
      { status: 415 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "parse failed", message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
