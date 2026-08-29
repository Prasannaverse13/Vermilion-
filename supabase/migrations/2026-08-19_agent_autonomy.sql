-- Vermilion — advanced autonomy tables
-- Adds: agent_goals (north-star metric snapshots), agent_plans
-- (long-running theses with status), agent_reflections (end-of-day
-- self-audits), agent_activity (every autonomous action, append-only),
-- user_settings (per-user config: timezone, chat tone, etc.)
--
-- Idempotent: safe to re-run.

-- ----- agent_goals -------------------------------------------------------
-- Periodic snapshots of the agent's north-star metrics. The dashboard
-- reads the latest row to display "X% refusal rate, target ≥ 70%".
create table if not exists public.agent_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  metric      text not null,           -- e.g. 'refusal-rate', 'edge-rate'
  current     numeric,
  target      text,
  trend       text check (trend in ('up','down','flat')),
  spark       jsonb,                    -- last 14 datapoints for sparkline
  captured_at timestamptz not null default now()
);

create index if not exists agent_goals_user_metric_time
  on public.agent_goals (user_id, metric, captured_at desc);

alter table public.agent_goals enable row level security;

drop policy if exists "agent_goals select own" on public.agent_goals;
create policy "agent_goals select own"
  on public.agent_goals for select
  using (auth.uid() = user_id);

drop policy if exists "agent_goals insert own" on public.agent_goals;
create policy "agent_goals insert own"
  on public.agent_goals for insert
  with check (auth.uid() = user_id);

-- ----- agent_plans -------------------------------------------------------
-- Long-running theses the agent has committed to. Examples:
--   "Thesis: AAPL is range-bound $220-$240 — sell strength, buy weakness"
--   "Plan: rotate 20% of cash into NVDA over the next 3 sessions"
--   "Watchlist expansion: add SMCI, ARM if volume > 1.5x avg"
create table if not exists public.agent_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  thesis      text not null,
  status      text not null default 'open' check (status in ('open','progressing','closed','abandoned')),
  symbols     text[] default '{}',
  opened_at   timestamptz not null default now(),
  closed_at   timestamptz,
  outcome     text,                     -- written on close
  progress    integer default 0,        -- 0..100, agent's self-reported
  meta        jsonb
);

create index if not exists agent_plans_user_status
  on public.agent_plans (user_id, status, opened_at desc);

alter table public.agent_plans enable row level security;

drop policy if exists "agent_plans select own" on public.agent_plans;
create policy "agent_plans select own"
  on public.agent_plans for select
  using (auth.uid() = user_id);

drop policy if exists "agent_plans insert own" on public.agent_plans;
create policy "agent_plans insert own"
  on public.agent_plans for insert
  with check (auth.uid() = user_id);

drop policy if exists "agent_plans update own" on public.agent_plans;
create policy "agent_plans update own"
  on public.agent_plans for update
  using (auth.uid() = user_id);

-- ----- agent_reflections -------------------------------------------------
-- End-of-day self-audit. The agent writes one row per session, in
-- plain English, citing specific decisions.
create table if not exists public.agent_reflections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  session_date  date not null,
  total_decisions  integer not null,
  total_refused   integer not null,
  total_executed  integer not null,
  wins           jsonb,                 -- [{symbol, action, pnl, lesson}]
  misses         jsonb,                 -- [{symbol, action, lesson}]
  text           text not null,         -- free-form reflection
  meta           jsonb,
  created_at    timestamptz not null default now()
);

create unique index if not exists agent_reflections_user_date
  on public.agent_reflections (user_id, session_date);

alter table public.agent_reflections enable row level security;

drop policy if exists "agent_reflections select own" on public.agent_reflections;
create policy "agent_reflections select own"
  on public.agent_reflections for select
  using (auth.uid() = user_id);

drop policy if exists "agent_reflections insert own" on public.agent_reflections;
create policy "agent_reflections insert own"
  on public.agent_reflections for insert
  with check (auth.uid() = user_id);

-- ----- agent_activity ----------------------------------------------------
-- Append-only log of every autonomous action the agent takes. The
-- /app/activity page renders this in reverse chronological order.
-- This is the single source of truth for "what has Vermilion been
-- doing on its own?"
create table if not exists public.agent_activity (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in (
    'wake-on-visit', 'cron-cycle', 'manual-cycle', 'self-recovery',
    'self-prompt', 'morning-brief', 'reflection',
    'plan-opened', 'plan-updated', 'plan-closed',
    'snapshot-failed', 'order-placed', 'order-failed',
    'threshold-tightened', 'threshold-loosened',
    'watchlist-expanded', 'watchlist-pruned'
  )),
  title       text not null,
  detail      text,
  symbols     text[] default '{}',
  meta        jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists agent_activity_user_time
  on public.agent_activity (user_id, created_at desc);

alter table public.agent_activity enable row level security;

drop policy if exists "agent_activity select own" on public.agent_activity;
create policy "agent_activity select own"
  on public.agent_activity for select
  using (auth.uid() = user_id);

drop policy if exists "agent_activity insert own" on public.agent_activity;
create policy "agent_activity insert own"
  on public.agent_activity for insert
  with check (auth.uid() = user_id);

-- ----- user_settings -----------------------------------------------------
-- Per-user preferences. Already partially referenced from the app
-- (timezone for ET labels). Created here so the agent can also
-- read settings like 'tone', 'autonomy_level'.
create table if not exists public.user_settings (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  tone        text not null default 'editorial' check (tone in ('editorial','clinical','casual')),
  autonomy_level text not null default 'autonomous' check (autonomy_level in ('autonomous','suggest','manual')),
  morning_brief_enabled boolean not null default true,
  reflection_enabled    boolean not null default true,
  meta        jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "user_settings select own" on public.user_settings;
create policy "user_settings select own"
  on public.user_settings for select
  using (auth.uid() = user_id);

drop policy if exists "user_settings upsert own" on public.user_settings;
create policy "user_settings upsert own"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_settings update own" on public.user_settings;
create policy "user_settings update own"
  on public.user_settings for update
  using (auth.uid() = user_id);
