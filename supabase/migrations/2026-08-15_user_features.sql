-- =============================================================
-- Vermilion — user-driven features migration
-- Adds: watchlist, chat_messages, user_settings
-- Run in Supabase SQL editor (safe to re-run)
-- =============================================================

-- ----- watchlist ---------------------------------------------------
-- Combined user+agent watchlist.
-- source = 'agent' for the 13 hard-coded defaults seeded on signup
-- source = 'user'  for anything the user added themselves
create table if not exists public.watchlist (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  symbol      text not null,
  source      text not null check (source in ('agent', 'user')) default 'user',
  added_at    timestamptz not null default now(),
  unique (user_id, symbol)
);

create index if not exists watchlist_user
  on public.watchlist (user_id);

alter table public.watchlist enable row level security;

drop policy if exists "watchlist select own" on public.watchlist;
create policy "watchlist select own"
  on public.watchlist for select
  to authenticated
  using ( (select auth.uid()) = user_id );

drop policy if exists "watchlist insert own" on public.watchlist;
create policy "watchlist insert own"
  on public.watchlist for insert
  to authenticated
  with check ( (select auth.uid()) = user_id
               and source in ('agent', 'user') );

drop policy if exists "watchlist delete own" on public.watchlist;
create policy "watchlist delete own"
  on public.watchlist for delete
  to authenticated
  using ( (select auth.uid()) = user_id
          and source = 'user' );   -- user can't delete agent defaults

-- Seed the 13 agent defaults for every new user on signup
create or replace function public.seed_default_watchlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  defaults text[] := array[
    'NVDA','AAPL','MSFT','GOOGL','META','AMZN','TSLA','SPY',
    'VTI','QQQ','JPM','AMD','NFLX'
  ];
  s text;
begin
  foreach s in array defaults loop
    insert into public.watchlist (user_id, symbol, source)
    values (new.id, s, 'agent')
    on conflict (user_id, symbol) do nothing;
  end loop;
  return new;
end;
$$;

drop trigger if exists seed_watchlist_on_signup on auth.users;
create trigger seed_watchlist_on_signup
  after insert on auth.users
  for each row execute function public.seed_default_watchlist();

-- ----- chat_messages -----------------------------------------------
-- Persistent chat history between user and Vermilion.
-- role: 'user' | 'assistant' | 'proposal' (a trade proposal card)
-- meta: jsonb with proposal details (action, qty, confidence, sources, etc.)
create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('user','assistant','proposal')),
  content     text not null,
  meta        jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists chat_messages_user_created
  on public.chat_messages (user_id, created_at);

alter table public.chat_messages enable row level security;

drop policy if exists "chat select own" on public.chat_messages;
create policy "chat select own"
  on public.chat_messages for select
  to authenticated
  using ( (select auth.uid()) = user_id );

drop policy if exists "chat insert own" on public.chat_messages;
create policy "chat insert own"
  on public.chat_messages for insert
  to authenticated
  with check ( (select auth.uid()) = user_id
               and role in ('user','assistant','proposal') );

drop policy if exists "chat delete own" on public.chat_messages;
create policy "chat delete own"
  on public.chat_messages for delete
  to authenticated
  using ( (select auth.uid()) = user_id );

-- ----- user_settings -----------------------------------------------
-- Per-user preferences. Currently just the auto-eval toggle, but
-- designed to grow.
create table if not exists public.user_settings (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  auto_evaluate      boolean not null default false,
  threshold          numeric(5,2) not null default 60.00,
  onboarded_at       timestamptz,
  updated_at         timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "settings select own" on public.user_settings;
create policy "settings select own"
  on public.user_settings for select
  to authenticated
  using ( (select auth.uid()) = user_id );

drop policy if exists "settings upsert own" on public.user_settings;
create policy "settings upsert own"
  on public.user_settings for insert
  to authenticated
  with check ( (select auth.uid()) = user_id );

drop policy if exists "settings update own" on public.user_settings;
create policy "settings update own"
  on public.user_settings for update
  to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

-- Auto-create settings row on signup
create or replace function public.handle_new_user_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_settings on auth.users;
create trigger on_auth_user_settings
  after insert on auth.users
  for each row execute function public.handle_new_user_settings();
