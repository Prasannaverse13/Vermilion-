"use client";

import { useEffect, useRef, useState, useTransition } from "react";

type Meta = null | {
  symbol?: string;
  action?: "buy" | "sell" | "short" | "cover";
  qty?: number;
  confidence?: number;
  reasoning?: string;
  sources?: { tag: string; text: string }[];
  lastPrice?: number;
  order_id?: string;
  fill_price?: number;
};

type Msg = {
  id: string;
  role: "user" | "assistant" | "proposal";
  content: string;
  meta: Meta;
  created_at: string;
};

type Focus = "all" | "audit" | "market" | "positions";

const SUGGESTIONS: { label: string; prompt: string; tag: string }[] = [
  { label: "What is NVDA doing today?", prompt: "What is NVDA doing today?", tag: "MARKET" },
  { label: "What are my biggest positions?", prompt: "What are my biggest positions?", tag: "PORTFOLIO" },
  { label: "Give me a morning brief", prompt: "Give me a morning brief on my portfolio and watchlist.", tag: "BRIEF" },
  { label: "Why did you refuse my last trade?", prompt: "Why did you refuse my last trade?", tag: "AUDIT" },
  { label: "Should I sell TSLA?", prompt: "Should I sell TSLA?", tag: "DECISION" },
  { label: "Latest news on AAPL", prompt: "What is the latest news on AAPL?", tag: "NEWS" },
];

const MODELS = [
  { id: "deepseek-chat", label: "Vermilion" },
  { id: "deepseek-reasoner", label: "Vermilion · Reasoning" },
];

const CAPABILITIES: never[] = []; // kept for backwards-compat, not rendered

export function ChatBox({
  initial,
  sessionId,
  onSessionCreated,
  onSources,
}: {
  initial: Msg[];
  sessionId: string | null;
  onSessionCreated?: (id: string) => void;
  onSources?: (sources: { tag: string; text: string }[]) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [focus, setFocus] = useState<Focus>("all");
  const [model, setModel] = useState(MODELS[0]);
  const [uploads, setUploads] = useState<
    { id: string; name: string; kind: string; preview: string; text: string; size: number }[]
  >([]);
  const [parsing, setParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 240) + "px";
    el.focus();
  }, [draft]);

  const send = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setError(null);
    setDraft("");
    // Prepend any uploaded file context so DeepSeek can analyze it.
    const attached = uploads.length
      ? `\n\n[Attached: ${uploads
          .map(
            (u) =>
              `${u.name} (${u.kind}, ${(u.size / 1024).toFixed(1)} KB)\n\`\`\`\n${u.text.slice(0, 12000)}\n\`\`\``,
          )
          .join("\n\n")}\n\n`
      : "";
    const fullContent = attached + clean;
    // Trade-intent messages must use the non-streaming route so the
    // tool_call response can be parsed server-side.
    const isTradeIntent = /\b(buy|sell|short|cover|purchase|acquire|dispose)\b/i.test(clean);
    const tempUser: Msg = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: clean + (uploads.length ? `  · ${uploads.length} attachment${uploads.length === 1 ? "" : "s"}` : ""),
      meta: { sources: uploads.map((u) => ({ tag: "ATTACH", text: u.name })) },
      created_at: new Date().toISOString(),
    };
    const placeholderId = `stream-${Date.now()}`;
    const placeholder: Msg = {
      id: placeholderId,
      role: "assistant",
      content: "",
      meta: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUser, placeholder]);
    setUploads([]);

    startTransition(async () => {
      if (isTradeIntent) {
        // Non-streaming path — tool calls need the full response
        try {
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: fullContent, focus, sessionId }),
          });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error || "send failed");
          if (j.sessionId && j.sessionId !== sessionId && onSessionCreated) {
            onSessionCreated(j.sessionId);
          }
          setMessages((prev) => {
            const next = prev.slice(0, -2);
            return [...next, tempUser, j.message];
          });
          if (onSources && j.message?.meta?.sources) {
            onSources(j.message.meta.sources);
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
          setMessages((prev) => prev.slice(0, -1));
        }
        return;
      }

      // Streaming path — user sees tokens the moment they arrive
      try {
        const res = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: fullContent, focus, sessionId }),
        });
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `stream failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        let finalMsg: Msg | null = null;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          const frames = acc.split("\n\n");
          acc = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.trim();
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            try {
              const evt = JSON.parse(payload);
              if (evt.delta) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === placeholderId
                      ? { ...m, content: m.content + evt.delta }
                      : m,
                  ),
                );
              } else if (evt.done) {
                finalMsg = evt.message;
                if (evt.sessionId && evt.sessionId !== sessionId && onSessionCreated) {
                  onSessionCreated(evt.sessionId);
                }
                if (onSources && finalMsg?.meta?.sources) {
                  onSources(finalMsg.meta.sources);
                }
              } else if (evt.error) {
                throw new Error(evt.error);
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message !== "Unexpected token") {
                throw parseErr;
              }
            }
          }
        }
        if (finalMsg) {
          // Replace the streaming placeholder with the persisted message
          setMessages((prev) =>
            prev.map((m) => (m.id === placeholderId ? finalMsg! : m)),
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setMessages((prev) => prev.filter((m) => m.id !== placeholderId));
      }
    });
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setParsing(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/chat/parse", { method: "POST", body: form });
        const j = await res.json();
        if (!res.ok) {
          setError(j.error || `parse failed for ${file.name}`);
          continue;
        }
        setUploads((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${file.name}`,
            name: j.name ?? file.name,
            kind: j.kind ?? "text",
            preview: j.meta?.preview ?? "",
            text: j.text ?? "",
            size: file.size,
          },
        ]);
      }
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const confirmProposal = (id: string) => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/chat/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId: id }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.message || j.error || "confirm failed");
        // Re-fetch this session's messages so the "Done." note appears
        if (sessionId) {
          const list = await fetch(`/api/chat?session=${sessionId}`).then((r) => r.json());
          if (list.messages) setMessages(list.messages);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const empty = messages.length === 0;

  return (
    <div className="relative flex flex-col h-full">
      {/* ---------- Center scroll area ---------- */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="mx-auto w-full max-w-6xl px-4 md:px-10 pt-6 md:pt-12 pb-72">
          {empty ? (
            <EmptyHero onPick={send} />
          ) : (
            <div className="flex flex-col gap-6">
              {/* Focus tabs — sticky feel, shown above the first message */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {(["all", "audit", "market", "positions"] as const).map((k) => {
                  const active = focus === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setFocus(k)}
                      className="px-3 py-1 rounded-pills cursor-pointer"
                      style={{
                        fontFamily: "var(--font-replica-mono)",
                        fontSize: "11px",
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        color: active ? "var(--color-obsidian)" : "var(--color-ash)",
                        background: active ? "var(--color-bone)" : "transparent",
                        border: active ? "1px solid var(--color-bone)" : "1px solid var(--color-smoke)",
                        fontWeight: active ? 600 : 500,
                      }}
                    >
                      {k}
                    </button>
                  );
                })}
                <span
                  className="ml-1"
                  style={{
                    fontFamily: "var(--font-replica-mono)",
                    fontSize: "10px",
                    color: "var(--color-smoke)",
                    letterSpacing: "0.08em",
                  }}
                >
                  focus
                </span>
              </div>

              {messages.map((m) => (
                <MessageRow
                  key={m.id}
                  m={m}
                  onConfirm={confirmProposal}
                  pending={pending}
                />
              ))}
              {pending && (
                <div className="flex justify-start">
                  <div
                    className="rounded-cards px-4 py-3 flex items-center gap-2"
                    style={{
                      background: "var(--color-carbon)",
                      border: "1px solid rgba(212, 208, 201, 0.1)",
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full live-dot"
                      style={{ background: "var(--color-bone)" }}
                    />
                    <span
                      style={{
                        fontFamily: "var(--font-replica-mono)",
                        fontSize: "12px",
                        color: "var(--color-ash)",
                      }}
                    >
                      Vermilion is reasoning…
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <p
              className="mt-4 rounded-cards px-4 py-2.5"
              style={{
                color: "var(--color-refuse)",
                background: "rgba(242, 154, 142, 0.08)",
                border: "1px solid rgba(242, 154, 142, 0.25)",
                fontSize: "13px",
              }}
            >
              {error}
            </p>
          )}
        </div>
      </div>

      {/* ---------- Sticky bottom composer ---------- */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.85) 30%, var(--color-obsidian) 60%)",
          paddingTop: "60px",
        }}
      >
        <div className="mx-auto w-full max-w-6xl px-4 md:px-10 pb-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!pending) send(draft);
            }}
            className="rounded-cards p-3 md:p-4 flex flex-col gap-2.5"
            style={{
              background: "var(--color-carbon)",
              border: "1px solid rgba(212, 208, 201, 0.16)",
              boxShadow: "0 24px 60px -20px rgba(0,0,0,0.6)",
            }}
          >
            {uploads.length > 0 && (
              <div
                className="flex items-center gap-2 px-1 pt-1 pb-2 flex-wrap"
                style={{ borderBottom: "1px solid rgba(212, 208, 201, 0.08)" }}
              >
                {uploads.map((u) => (
                  <span
                    key={u.id}
                    className="inline-flex items-center gap-1.5 rounded-pills"
                    style={{
                      background: "var(--color-tar)",
                      border: "1px solid var(--color-smoke)",
                      padding: "4px 8px 4px 10px",
                      fontSize: "11px",
                      color: "var(--color-bone)",
                    }}
                    title={u.name}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-replica-mono)",
                        fontSize: "9px",
                        letterSpacing: "0.1em",
                        color: "var(--color-ash)",
                        textTransform: "uppercase",
                      }}
                    >
                      {u.kind}
                    </span>
                    <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u.name}
                    </span>
                    <span style={{ color: "var(--color-smoke)", fontSize: "10px" }}>
                      {(u.size / 1024).toFixed(1)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => setUploads((p) => p.filter((x) => x.id !== u.id))}
                      aria-label="Remove attachment"
                      style={{
                        color: "var(--color-ash)",
                        fontSize: "14px",
                        lineHeight: 1,
                        padding: 0,
                        marginLeft: 2,
                        cursor: "pointer",
                        background: "transparent",
                        border: "none",
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!pending) send(draft);
                }
              }}
              placeholder={
                empty
                  ? "Ask anything about your portfolio, decisions, or the market…"
                  : "Ask Vermilion anything about your portfolio, decisions, or the market…"
              }
              rows={1}
              maxLength={2000}
              className="w-full px-1.5 py-1.5 outline-none resize-none"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--color-bone)",
                fontSize: "16px",
                lineHeight: 1.5,
                letterSpacing: "-0.01em",
                fontFamily: "var(--font-replica-regular)",
              }}
            />

            <div className="flex items-center gap-2 px-1 flex-wrap">
              {/* + (opens file picker) */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                accept=".csv,.tsv,.xlsx,.xls,.docx,.pdf,.txt,.md,.markdown,.log,.json,.png,.jpg,.jpeg,.gif,.webp"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <button
                type="button"
                aria-label="Attach file"
                onClick={() => fileInputRef.current?.click()}
                disabled={parsing}
                className="rounded-pills cursor-pointer"
                style={{
                  width: 36,
                  height: 36,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: parsing ? "var(--color-tar)" : "transparent",
                  color: "var(--color-ash)",
                  border: "1px solid var(--color-smoke)",
                  fontSize: "18px",
                }}
              >
                {parsing ? (
                  <span
                    className="w-2 h-2 rounded-full live-dot"
                    style={{ background: "var(--color-bone)" }}
                  />
                ) : (
                  "+"
                )}
              </button>

              <div className="ml-auto flex items-center gap-2">
                {/* Model dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setModelOpen((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-pills cursor-pointer"
                    style={{
                      height: 36,
                      padding: "0 12px",
                      background: "transparent",
                      color: "var(--color-ash)",
                      border: "1px solid var(--color-smoke)",
                      fontFamily: "var(--font-replica-mono)",
                      fontSize: "12px",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {model.label}
                    <span>▾</span>
                  </button>
                  {modelOpen && (
                    <div
                      className="absolute right-0 bottom-full mb-2 rounded-cards"
                      style={{
                        background: "var(--color-carbon)",
                        border: "1px solid var(--color-smoke)",
                        minWidth: "200px",
                        padding: 4,
                        zIndex: 20,
                      }}
                    >
                      {MODELS.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setModel(m);
                            setModelOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-cards cursor-pointer"
                          style={{
                            color: model.id === m.id ? "var(--color-bone)" : "var(--color-ash)",
                            background:
                              model.id === m.id ? "rgba(212, 208, 201, 0.08)" : "transparent",
                            fontSize: "13px",
                          }}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Submit (audio-style circle button) */}
                <button
                  type="submit"
                  disabled={pending || !draft.trim()}
                  aria-label="Send"
                  className="rounded-pills cursor-pointer transition-all disabled:opacity-40"
                  style={{
                    width: 36,
                    height: 36,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--color-bone)",
                    color: "var(--color-obsidian)",
                    border: "none",
                  }}
                >
                  {pending ? (
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: "var(--color-obsidian)" }}
                    />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </form>
          <p
            className="text-center mt-3"
            style={{
              color: "var(--color-smoke)",
              fontFamily: "var(--font-replica-mono)",
              fontSize: "10px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            MCP · Alpaca · DeepSeek · user confirms every trade
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty hero — "What do you want to know?"                            */
/* ------------------------------------------------------------------ */

function EmptyHero({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="pt-8 md:pt-16">
      <div
        className="mb-3"
        style={{
          fontFamily: "var(--font-replica-mono)",
          fontSize: "11px",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--color-ash)",
        }}
      >
        Search
      </div>
      <h1
        style={{
          fontSize: "clamp(36px, 5vw, 56px)",
          lineHeight: 1.05,
          letterSpacing: "-0.025em",
          color: "var(--color-bone)",
          fontWeight: 300,
        }}
      >
        What do you want to know?
      </h1>
      <p
        className="mt-3 max-w-2xl"
        style={{
          color: "var(--color-ash)",
          fontSize: "15px",
          lineHeight: 1.55,
        }}
      >
        Vermilion reads your positions, your audit log, and live Alpaca
        data via MCP. If you ask it to consider a trade, it returns a
        proposal you confirm. Nothing is ever placed without your click.
      </p>

      <div className="mt-8">
        <div
          className="mb-3"
          style={{
            fontFamily: "var(--font-replica-mono)",
            fontSize: "10px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--color-ash)",
          }}
        >
          Try
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.prompt}
              type="button"
              onClick={() => onPick(s.prompt)}
              className="group text-left rounded-cards p-4 cursor-pointer transition-all"
              style={{
                background: "var(--color-carbon)",
                border: "1px solid rgba(212, 208, 201, 0.1)",
              }}
            >
              <div
                className="mb-2"
                style={{
                  fontFamily: "var(--font-replica-mono)",
                  fontSize: "10px",
                  letterSpacing: "0.08em",
                  color: "var(--color-ash)",
                }}
              >
                {s.tag}
              </div>
              <div
                style={{
                  color: "var(--color-bone)",
                  fontSize: "15px",
                  lineHeight: 1.35,
                  letterSpacing: "-0.01em",
                }}
              >
                {s.label}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Message row                                                        */
/* ------------------------------------------------------------------ */

function MessageRow({
  m,
  onConfirm,
  pending,
}: {
  m: Msg;
  onConfirm: (id: string) => void;
  pending: boolean;
}) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="px-4 py-2.5 max-w-[80%]"
          style={{
            background: "rgba(212, 208, 201, 0.12)",
            color: "var(--color-bone)",
            borderRadius: "18px 18px 4px 18px",
            fontSize: "15px",
            lineHeight: 1.45,
            letterSpacing: "-0.01em",
          }}
        >
          {m.content}
        </div>
      </div>
    );
  }

  if (m.role === "proposal") {
    const meta = m.meta ?? {};
    const executed = !!meta.order_id;
    return (
      <div className="flex flex-col gap-2 items-start">
        <AnswerHeader />
        <article
          className="rounded-cards p-4 md:p-5 w-full max-w-[90%]"
          style={{
            background: "var(--color-carbon)",
            border: executed
              ? "1px solid rgba(31, 226, 116, 0.32)"
              : "1px solid rgba(212, 208, 201, 0.16)",
          }}
        >
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "10px",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: executed ? "var(--color-execute)" : "var(--color-bone)",
                padding: "3px 8px",
                border: `1px solid ${executed ? "rgba(31, 226, 116, 0.4)" : "rgba(212, 208, 201, 0.3)"}`,
                borderRadius: "100px",
                fontWeight: 600,
              }}
            >
              {executed ? "✓ Executed" : "Trade proposal"}
            </span>
            <span
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "10px",
                letterSpacing: "0.08em",
                color: "var(--color-ash)",
              }}
            >
              MCP · Alpaca · {meta.symbol}
            </span>
          </div>

          <div
            style={{
              color: "var(--color-chalk)",
              fontSize: "22px",
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
              fontWeight: 400,
            }}
          >
            {meta.action?.toUpperCase()} {meta.qty} {meta.symbol}
            {meta.lastPrice ? ` @ $${meta.lastPrice.toFixed(2)}` : ""}
            {meta.fill_price ? ` · filled @ $${Number(meta.fill_price).toFixed(2)}` : ""}
          </div>

          {meta.confidence != null && (
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <span
                style={{
                  fontFamily: "var(--font-replica-mono)",
                  fontSize: "12px",
                  color: "var(--color-ash)",
                }}
              >
                {Math.round(meta.confidence)}% confidence · threshold 60%
              </span>
            </div>
          )}

          <p
            className="mt-3"
            style={{ color: "var(--color-bone)", fontSize: "15px", lineHeight: 1.5 }}
          >
            {m.content}
          </p>

          {meta.sources && meta.sources.length > 0 && <SourceRow sources={meta.sources} />}

          {!executed && (
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => onConfirm(m.id)}
                disabled={pending}
                className="rounded-pills px-4 py-2 transition-all disabled:opacity-40 cursor-pointer"
                style={{
                  background: "var(--color-execute)",
                  color: "var(--color-obsidian)",
                  fontSize: "13px",
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                  border: "none",
                }}
              >
                ✓ Confirm & place order
              </button>
              <span
                style={{
                  color: "var(--color-ash)",
                  fontFamily: "var(--font-replica-mono)",
                  fontSize: "11px",
                }}
              >
                Requires market open · max 8% of equity
              </span>
            </div>
          )}

          {executed && (
            <div
              className="mt-3"
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "12px",
                color: "var(--color-execute)",
              }}
            >
              ✓ order id {meta.order_id?.slice(0, 8)}…
            </div>
          )}
        </article>
      </div>
    );
  }

  const sources = (m.meta?.sources as { tag: string; text: string }[] | undefined) ?? [];
  return (
    <div className="flex flex-col gap-2 items-start">
      <AnswerHeader />
      <article
        className="rounded-cards p-4 md:p-5 w-full max-w-[90%]"
        style={{
          background: "var(--color-carbon)",
          border: "1px solid rgba(212, 208, 201, 0.1)",
        }}
      >
        <div
          className="whitespace-pre-wrap"
          style={{
            color: "var(--color-bone)",
            fontSize: "15px",
            lineHeight: 1.6,
            letterSpacing: "-0.01em",
          }}
        >
          {m.content}
        </div>

        {sources.length > 0 && <SourceRow sources={sources} />}
      </article>
    </div>
  );
}

function AnswerHeader() {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-flex items-center justify-center"
        style={{
          width: "22px",
          height: "22px",
          borderRadius: "6px",
          background: "var(--color-bone)",
          color: "var(--color-obsidian)",
          fontFamily: "var(--font-replica-mono)",
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "-0.02em",
        }}
      >
        V
      </span>
      <span
        style={{
          fontFamily: "var(--font-replica-mono)",
          fontSize: "10px",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--color-ash)",
        }}
      >
        Vermilion
      </span>
    </div>
  );
}

function SourceRow({ sources }: { sources: { tag: string; text: string }[] }) {
  return (
    <div
      className="mt-4 pt-3 flex flex-wrap gap-2"
      style={{ borderTop: "1px solid rgba(212, 208, 201, 0.08)" }}
    >
      <span
        className="mr-1 self-center"
        style={{
          fontFamily: "var(--font-replica-mono)",
          fontSize: "10px",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--color-smoke)",
        }}
      >
        Sources
      </span>
      {sources.map((s, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1.5 rounded-pills px-2.5 py-1"
          style={{
            border: "1px solid var(--color-smoke)",
            background: "rgba(212, 208, 201, 0.04)",
          }}
          title={s.text}
        >
          <span
            style={{
              fontFamily: "var(--font-replica-mono)",
              fontSize: "9px",
              letterSpacing: "0.1em",
              color: "var(--color-bone)",
              fontWeight: 600,
            }}
          >
            {s.tag}
          </span>
          <span
            style={{
              color: "var(--color-ash)",
              fontSize: "11px",
              lineHeight: 1.3,
              maxWidth: "260px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {s.text}
          </span>
        </span>
      ))}
    </div>
  );
}
