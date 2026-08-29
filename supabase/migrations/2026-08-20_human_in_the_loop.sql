-- Vermilion — human-in-the-loop tables
-- Adds: user_goals (user-editable targets, autonomy level, notification settings),
--        pending_decisions (queue of agent-proposed trades awaiting user sign-off),
--        notification_log (every outbound message — Telegram/WhatsApp/Apple/Email).
-- Idempotent: safe to re-run.

-- ----- user_goals ----------------------------------------------------------
-- One row per user. Created lazily on first /api/agent/goals call.
create table if not exists public.user_goals (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  target_refusal_rate  numeric(5,2) default 70.00,  -- 0-100
  target_edge_rate     numeric(5,2) default 40.00,  -- 0-100
  target_sharpe        numeric(6,3) default 1.000,  -- informational
  max_drawdown_pct     numeric(5,2) default 15.00,  -- 0-100
  position_cap_pct     numeric(5,2) default 8.00,   -- 0-100
  confidence_threshold numeric(5,2) default 60.00,  -- 0-100
  autonomy_level       text not null default 'suggest'
                        check (autonomy_level in ('autonomous','suggest','manual')),
  auto_approve_delay_s integer not null default 300, -- 5 min grace before autonomous trades execute
  notifications        jsonb not null default '{}'::jsonb,
  meta                 jsonb,
  updated_at           timestamptz not null default now()
);

alter table public.user_goals enable row level security;

drop policy if exists "user_goals sel own" on public.user_goals;
create policy "user_goals sel own" on public.user_goals for select using (auth.uid() = user_id);
drop policy if exists "user_goals ins own" on public.user_goals;
create policy "user_goals ins own" on public.user_goals for insert with check (auth.uid() = user_id);
drop policy if exists "user_goals upd own" on public.user_goals;
create policy "user_goals upd own" on public.user_goals for update using (auth.uid() = user_id);

-- ----- pending_decisions ---------------------------------------------------
-- A queue of agent-proposed trades. Created on cycle when the agent wants
-- to execute; resolved (approved / declined / expired) by user action.
-- Either the user signs off (we then place the order) or the grace period
-- expires and the order goes through automatically.
create table if not exists public.pending_decisions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  decision_id     uuid references public.decisions(id) on delete set null,
  symbol          text not null,
  action          text not null check (action in ('buy','sell','short','cover')),
  qty             numeric(18,6) not null,
  est_price       numeric(18,6),
  confidence      numeric(5,2) not null,
  threshold       numeric(5,2) not null,
  reasoning       text not null,
  sources         jsonb,
  status          text not null default 'pending'
                    check (status in ('pending','approved','declined','expired','executed','failed')),
  user_comment    text,
  approved_at     timestamptz,
  declined_at     timestamptz,
  expired_at      timestamptz,
  executed_at     timestamptz,
  order_id        text,
  fill_price      numeric(18,6),
  error           text,
  resolve_token   text unique default encode(gen_random_bytes(16), 'hex'),
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now()
);

create index if not exists pending_decisions_user_status
  on public.pending_decisions (user_id, status, created_at desc);
create index if not exists pending_decisions_expires
  on public.pending_decisions (expires_at) where status = 'pending';

alter table public.pending_decisions enable row level security;

drop policy if exists "pending_dec sel own" on public.pending_decisions;
create policy "pending_dec sel own" on public.pending_decisions for select using (auth.uid() = user_id);
drop policy if exists "pending_dec ins own" on public.pending_decisions;
create policy "pending_dec ins own" on public.pending_decisions for insert with check (auth.uid() = user_id);
drop policy if exists "pending_dec upd own" on public.pending_decisions;
create policy "pending_dec upd own" on public.pending_decisions for update using (auth.uid() = user_id);

-- ----- notification_log ----------------------------------------------------
-- Every outbound message we send — Telegram, WhatsApp, Apple, Email.
-- Used for the in-app notification bell and to debug delivery.
create table if not exists public.notification_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  channel     text not null check (channel in ('telegram','whatsapp','apple','email','inapp')),
  kind        text not null,                          -- 'pending_decision','reflection','morning_brief','plan_opened'
  subject     text,
  body        text not null,
  target      text,                                   -- chat_id / phone / email
  status      text not null default 'queued' check (status in ('queued','sent','delivered','failed','read')),
  external_id text,                                   -- telegram message_id etc.
  error       text,
  pending_decision_id uuid references public.pending_decisions(id) on delete set null,
  meta        jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists notification_log_user_time
  on public.notification_log (user_id, created_at desc);

alter table public.notification_log enable row level security;

drop policy if exists "notif sel own" on public.notification_log;
create policy "notif sel own" on public.notification_log for select using (auth.uid() = user_id);
drop policy if exists "notif ins own" on public.notification_log;
create policy "notif ins own" on public.notification_log for insert with check (auth.uid() = user_id);
drop policy if exists "notif upd own" on public.notification_log;
create policy "notif upd own" on public.notification_log for update using (auth.uid() = user_id);
