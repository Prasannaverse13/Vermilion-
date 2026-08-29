-- =============================================================
-- Vermilion — chat sessions (idempotent)
-- Re-run safe: drops existing policies/triggers/indexes before
-- recreating. Run in Supabase SQL editor.
-- =============================================================

create table if not exists public.chat_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null default 'New chat',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists chat_sessions_user_updated
  on public.chat_sessions (user_id, updated_at desc);

alter table public.chat_sessions enable row level security;

drop policy if exists "sessions select own" on public.chat_sessions;
drop policy if exists "sessions insert own" on public.chat_sessions;
drop policy if exists "sessions update own" on public.chat_sessions;
drop policy if exists "sessions delete own" on public.chat_sessions;

create policy "sessions select own"
  on public.chat_sessions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "sessions insert own"
  on public.chat_sessions for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "sessions update own"
  on public.chat_sessions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "sessions delete own"
  on public.chat_sessions for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Add session_id FK to chat_messages (idempotent)
alter table public.chat_messages
  add column if not exists session_id uuid
    references public.chat_sessions(id) on delete cascade;

create index if not exists chat_messages_session
  on public.chat_messages (session_id, created_at);

-- Bump session.updated_at on new message
create or replace function public.bump_chat_session()
returns trigger
language plpgsql
as $$
begin
  if new.session_id is not null then
    update public.chat_sessions
      set updated_at = now()
      where id = new.session_id;
  end if;
  return new;
end;
$$;

drop trigger if exists bump_chat_session on public.chat_messages;
create trigger bump_chat_session
  after insert on public.chat_messages
  for each row execute function public.bump_chat_session();
