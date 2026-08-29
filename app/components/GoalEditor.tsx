"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Goals = {
  user_id: string;
  target_refusal_rate: number;
  target_edge_rate: number;
  target_sharpe: number;
  max_drawdown_pct: number;
  position_cap_pct: number;
  confidence_threshold: number;
  autonomy_level: "autonomous" | "suggest" | "manual";
  auto_approve_delay_s: number;
  notifications: {
    telegram?: { bot_token?: string; chat_id?: string };
    whatsapp?: { phone_number_id?: string; access_token?: string; recipient_wa_id?: string };
    apple?: { business_id?: string; recipient_apple_id?: string };
    email?: { address?: string };
  };
};

export function GoalEditor({ goals }: { goals: Goals }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [draft, setDraft] = useState<Goals>(goals);
  const [telegramBot, setTelegramBot] = useState(goals.notifications.telegram?.bot_token ?? "");
  const [telegramChat, setTelegramChat] = useState(goals.notifications.telegram?.chat_id ?? "");
  const [waPhone, setWaPhone] = useState(goals.notifications.whatsapp?.phone_number_id ?? "");
  const [waToken, setWaToken] = useState(goals.notifications.whatsapp?.access_token ?? "");
  const [waRecipient, setWaRecipient] = useState(goals.notifications.whatsapp?.recipient_wa_id ?? "");
  const [appleBiz, setAppleBiz] = useState(goals.notifications.apple?.business_id ?? "");
  const [appleRecipient, setAppleRecipient] = useState(goals.notifications.apple?.recipient_apple_id ?? "");
  const [email, setEmail] = useState(goals.notifications.email?.address ?? "");

  const save = (overrides: Partial<Goals> = {}) => {
    setError(null);
    setOk(null);
    startTransition(async () => {
      try {
        const next: Goals = {
          ...draft,
          notifications: {
            telegram: telegramBot && telegramChat
              ? { bot_token: telegramBot, chat_id: telegramChat }
              : undefined,
            whatsapp: waPhone && waToken && waRecipient
              ? { phone_number_id: waPhone, access_token: waToken, recipient_wa_id: waRecipient }
              : undefined,
            apple: appleBiz && appleRecipient
              ? { business_id: appleBiz, recipient_apple_id: appleRecipient }
              : undefined,
            email: email ? { address: email } : undefined,
          },
          ...overrides,
        };
        const res = await fetch("/api/agent/goals", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(j.error ?? "save_failed");
          return;
        }
        setOk("Saved.");
        setDraft(next);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Targets */}
      <section
        className="rounded-cards p-6 md:p-7"
        style={{ background: "var(--color-tar)", border: "1px solid #1a1a1f" }}
      >
        <h3 className="text-bone-white" style={{ fontSize: "18px", fontWeight: 500 }}>
          Targets
        </h3>
        <p className="text-fog mt-1" style={{ fontSize: "13px", lineHeight: 1.5 }}>
          These are the targets Vermilion optimizes for. They're injected into the LLM
          system prompt at every cycle. Higher refusal rate = more conservative.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          <Slider
            label="Target refusal rate"
            suffix="%"
            min={0}
            max={100}
            value={draft.target_refusal_rate}
            onChange={(v) => setDraft({ ...draft, target_refusal_rate: v })}
            hint="≥ 70% means Vermilion refuses more than it trades."
          />
          <Slider
            label="Target edge rate"
            suffix="%"
            min={0}
            max={100}
            value={draft.target_edge_rate}
            onChange={(v) => setDraft({ ...draft, target_edge_rate: v })}
            hint="≥ 40% of executed trades should clear threshold on first try."
          />
          <Slider
            label="Position cap"
            suffix="%"
            min={1}
            max={25}
            value={draft.position_cap_pct}
            onChange={(v) => setDraft({ ...draft, position_cap_pct: v })}
            hint="Largest single position as a % of equity."
          />
          <Slider
            label="Max drawdown"
            suffix="%"
            min={1}
            max={50}
            value={draft.max_drawdown_pct}
            onChange={(v) => setDraft({ ...draft, max_drawdown_pct: v })}
            hint="Soft cap; agent avoids strategies that risk breaching this."
          />
          <Slider
            label="Confidence threshold"
            suffix="%"
            min={0}
            max={100}
            value={draft.confidence_threshold}
            onChange={(v) => setDraft({ ...draft, confidence_threshold: v })}
            hint="Vermilion only trades when its own confidence is at or above this."
          />
        </div>
        <div className="mt-6 flex items-center gap-2">
          <button
            type="button"
            onClick={() => save()}
            disabled={pending}
            className="pill-primary disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save targets"}
          </button>
          {ok && <span style={{ color: "var(--color-execute)", fontSize: "12px" }}>{ok}</span>}
          {error && <span style={{ color: "var(--color-refuse)", fontSize: "12px" }}>{error}</span>}
        </div>
      </section>

      {/* Autonomy */}
      <section
        className="rounded-cards p-6 md:p-7"
        style={{ background: "var(--color-tar)", border: "1px solid #1a1a1f" }}
      >
        <h3 className="text-bone-white" style={{ fontSize: "18px", fontWeight: 500 }}>
          Autonomy
        </h3>
        <p className="text-fog mt-1" style={{ fontSize: "13px", lineHeight: 1.5 }}>
          Vermilion can either wait for you forever, queue every trade for your sign-off,
          or auto-execute after a grace period. Trades still get logged to the audit
          trail either way.
        </p>
        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          {(["manual", "suggest", "autonomous"] as const).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => save({ autonomy_level: level })}
              disabled={pending}
              className="rounded-cards p-4 text-left"
              style={{
                background:
                  draft.autonomy_level === level
                    ? "rgba(31, 226, 116, 0.06)"
                    : "var(--color-graphite)",
                border:
                  draft.autonomy_level === level
                    ? "1px solid rgba(31, 226, 116, 0.4)"
                    : "1px solid #1a1a1f",
                cursor: "pointer",
              }}
            >
              <p
                className="text-bone-white"
                style={{ fontSize: "15px", fontWeight: 500, textTransform: "capitalize" }}
              >
                {level}
              </p>
              <p className="text-ash mt-1" style={{ fontSize: "12px", lineHeight: 1.5 }}>
                {level === "manual" && "Vermilion never trades without your click. The queue fills up."}
                {level === "suggest" && "Vermilion proposes every trade. You approve or decline in the queue."}
                {level === "autonomous" && `Vermilion auto-executes after the grace period below unless you veto.`}
              </p>
            </button>
          ))}
        </div>
        <div className="mt-5">
          <Slider
            label="Auto-approve grace period"
            suffix="s"
            min={30}
            max={1800}
            step={30}
            value={draft.auto_approve_delay_s}
            onChange={(v) => setDraft({ ...draft, auto_approve_delay_s: v })}
            hint={`${(draft.auto_approve_delay_s / 60).toFixed(1)} min — how long a pending decision waits before auto-execution in autonomous mode.`}
          />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => save()}
            disabled={pending}
            className="pill-primary disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save autonomy"}
          </button>
        </div>
      </section>

      {/* Notification channels */}
      <section
        className="rounded-cards p-6 md:p-7"
        style={{ background: "var(--color-tar)", border: "1px solid #1a1a1f" }}
      >
        <h3 className="text-bone-white" style={{ fontSize: "18px", fontWeight: 500 }}>
          Notification channels
        </h3>
        <p className="text-fog mt-1" style={{ fontSize: "13px", lineHeight: 1.5 }}>
          When Vermilion proposes a trade, it pages you on every channel you connect
          here. Approve / Decline / Comment buttons work the same in all of them.
        </p>

        <div className="mt-6 space-y-6">
          <ChannelCard
            title="Telegram"
            blurb="Get a Telegram message with inline Approve / Decline buttons. Set up: message @BotFather, paste the bot token + your chat id below."
            fields={[
              { label: "Bot token", value: telegramBot, onChange: setTelegramBot, placeholder: "123456:ABC-DEF…" },
              { label: "Chat id", value: telegramChat, onChange: setTelegramChat, placeholder: "123456789" },
            ]}
            onSave={() => save()}
            pending={pending}
            configured={!!(telegramBot && telegramChat)}
          />
          <ChannelCard
            title="WhatsApp"
            blurb="Meta WhatsApp Cloud API. You need a WABA + phone number + permanent access token. We send a button-list message; you tap to approve."
            fields={[
              { label: "Phone number id", value: waPhone, onChange: setWaPhone, placeholder: "1234567890" },
              { label: "Access token", value: waToken, onChange: setWaToken, placeholder: "EAAJ…" },
              { label: "Recipient (wa_id)", value: waRecipient, onChange: setWaRecipient, placeholder: "91xxxxxxxxxx" },
            ]}
            onSave={() => save()}
            pending={pending}
            configured={!!(waPhone && waToken && waRecipient)}
          />
          <ChannelCard
            title="Apple Messages for Business"
            blurb="Apple Business Chat. Requires a registered business account (register.apple.com/business-chat). The recipient ID is the Apple-anonymized user identifier surfaced when the customer opts in."
            fields={[
              { label: "Business id", value: appleBiz, onChange: setAppleBiz, placeholder: "abc123-def4-…" },
              { label: "Recipient apple id", value: appleRecipient, onChange: setAppleRecipient, placeholder: "ANONYMIZED_APPLE_ID" },
            ]}
            onSave={() => save()}
            pending={pending}
            configured={!!(appleBiz && appleRecipient)}
          />
          <ChannelCard
            title="Email (Resend)"
            blurb="Transactional email via Resend. Approve / Decline links land in your inbox; replies are forwarded back as comments. Set RESEND_API_KEY in your env."
            fields={[
              { label: "Email address", value: email, onChange: setEmail, placeholder: "you@example.com" },
            ]}
            onSave={() => save()}
            pending={pending}
            configured={!!email}
          />
        </div>
        {error && <p className="mt-3" style={{ color: "var(--color-refuse)", fontSize: "12px" }}>{error}</p>}
        {ok && <p className="mt-3" style={{ color: "var(--color-execute)", fontSize: "12px" }}>{ok}</p>}
      </section>
    </div>
  );
}

function Slider({
  label,
  suffix,
  min,
  max,
  step = 1,
  value,
  onChange,
  hint,
}: {
  label: string;
  suffix: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span
          className="text-ash"
          style={{
            fontFamily: "var(--font-replica-mono)",
            fontSize: "10px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        <span
          className="text-bone-white"
          style={{
            fontFamily: "var(--font-replica-mono)",
            fontSize: "16px",
            fontWeight: 500,
          }}
        >
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: "var(--color-bone)" }}
      />
      {hint && (
        <span className="text-fog" style={{ fontSize: "11px", lineHeight: 1.4 }}>
          {hint}
        </span>
      )}
    </label>
  );
}

function ChannelCard({
  title,
  blurb,
  fields,
  onSave,
  pending,
  configured,
}: {
  title: string;
  blurb: string;
  fields: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }[];
  onSave: () => void;
  pending: boolean;
  configured: boolean;
}) {
  return (
    <div
      className="rounded-cards p-5"
      style={{
        background: configured ? "rgba(31, 226, 116, 0.04)" : "var(--color-graphite)",
        border: configured ? "1px solid rgba(31, 226, 116, 0.3)" : "1px solid #1a1a1f",
      }}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-bone-white" style={{ fontSize: "15px", fontWeight: 500 }}>
          {title}
        </h4>
        <span
          className="px-2 py-0.5 rounded-pills"
          style={{
            fontFamily: "var(--font-replica-mono)",
            fontSize: "10px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: configured ? "var(--color-execute)" : "var(--color-ash)",
            border: configured ? "1px solid rgba(31, 226, 116, 0.4)" : "1px solid #2a2a2f",
          }}
        >
          {configured ? "connected" : "not configured"}
        </span>
      </div>
      <p className="text-fog mt-2" style={{ fontSize: "12px", lineHeight: 1.5 }}>
        {blurb}
      </p>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        {fields.map((f) => (
          <label key={f.label} className="flex flex-col gap-1">
            <span
              className="text-ash"
              style={{
                fontFamily: "var(--font-replica-mono)",
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {f.label}
            </span>
            <input
              type="text"
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              placeholder={f.placeholder}
              className="px-3 py-2 outline-none"
              style={{
                background: "var(--color-tar)",
                border: "1px solid var(--color-smoke)",
                borderRadius: 6,
                fontSize: "12px",
                color: "var(--color-bone)",
                fontFamily: "var(--font-replica-mono)",
              }}
            />
          </label>
        ))}
      </div>
      <div className="mt-3">
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="pill-ghost disabled:opacity-50"
          style={{ fontSize: "12px", padding: "8px 16px" }}
        >
          {pending ? "Saving…" : configured ? "Update channel" : "Connect channel"}
        </button>
      </div>
    </div>
  );
}
