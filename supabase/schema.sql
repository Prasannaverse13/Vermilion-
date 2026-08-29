-- =============================================================
-- Vermilion — Supabase schema
-- Run this in the Supabase SQL editor (Project -> SQL -> New query)
-- =============================================================
--
-- Three tables back the app:
--   profiles        — per-user display info
--   decisions       — every decision the agent makes (executed or refused)
--   positions       — currently-held paper positions per user
--
-- All tables have RLS enabled, owner-only access. The service_role
-- key (server-side only) can bypass RLS for the agent's writes.

-- ----- profiles ----------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  name        text,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own"
  on public.profiles for select
  to authenticated
  using ( (select auth.uid()) = id );

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own"
  on public.profiles for insert
  to authenticated
  with check ( (select auth.uid()) = id );

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
  on public.profiles for update
  to authenticated
  using ( (select auth.uid()) = id )
  with check ( (select auth.uid()) = id );

-- Auto-create a profile row on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, new.raw_user_meta_data->>'name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----- decisions ---------------------------------------------------
create table if not exists public.decisions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  symbol       text not null,
  action       text not null check (action in ('buy', 'sell', 'short', 'cover', 'refuse')),
  refused      boolean not null default false,
  confidence   numeric(5,2),                       -- 0.00 - 100.00
  threshold    numeric(5,2) not null default 60.00,
  reasoning    text,
  sources      jsonb,                              -- [{tag, text, weight}, ...]
  factors      jsonb,                              -- [{label, value, kind}, ...]
  qty          numeric(18, 6),
  price        numeric(18, 6),
  created_at   timestamptz not null default now()
);

create index if not exists decisions_user_created
  on public.decisions (user_id, created_at desc);

alter table public.decisions enable row level security;

drop policy if exists "decisions select own" on public.decisions;
create policy "decisions select own"
  on public.decisions for select
  to authenticated
  using ( (select auth.uid()) = user_id );

drop policy if exists "decisions insert own" on public.decisions;
create policy "decisions insert own"
  on public.decisions for insert
  to authenticated
  with check ( (select auth.uid()) = user_id );

-- (Updates are intentionally not allowed — decisions are immutable.
--  Deletes are intentionally not allowed — see "logs forever" in
--  the agent's principles. Soft-delete via a future column if needed.)

-- ----- positions ---------------------------------------------------
create table if not exists public.positions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  symbol       text not null,
  name         text,
  qty          numeric(18, 6) not null,
  entry_price  numeric(18, 6) not null,
  current_price numeric(18, 6) not null,
  opened_at    timestamptz not null default now(),
  closed_at    timestamptz,
  unique (user_id, symbol, closed_at)
);

create index if not exists positions_user_open
  on public.positions (user_id, closed_at);

alter table public.positions enable row level security;

drop policy if exists "positions select own" on public.positions;
create policy "positions select own"
  on public.positions for select
  to authenticated
  using ( (select auth.uid()) = user_id );

drop policy if exists "positions insert own" on public.positions;
create policy "positions insert own"
  on public.positions for insert
  to authenticated
  with check ( (select auth.uid()) = user_id );

drop policy if exists "positions update own" on public.positions;
create policy "positions update own"
  on public.positions for update
  to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

-- ----- Realtime ----------------------------------------------------
-- Enable Realtime on the decisions table so the app can show new
-- agent decisions in the audit log live.
alter publication supabase_realtime add table public.decisions;
