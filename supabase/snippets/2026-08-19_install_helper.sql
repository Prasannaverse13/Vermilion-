-- One-time install of the migration runner. Paste this into the
-- Supabase SQL editor ONCE. After that, the app can apply any DDL
-- by calling vermilion_apply('<sql>') via the service-role client.
--
-- The function is security definer + restricted to the service role
-- via a guard, so anon / authenticated users cannot invoke it.

create or replace function public.vermilion_apply(sql text)
returns text
language plpgsql
security definer
as $$
declare
  result text;
begin
  -- Service role only. auth.role() returns 'service_role' when called
  -- server-side with the service key; 'anon' / 'authenticated' for
  -- normal client requests.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'vermilion_apply is service_role only (got role=%)', auth.role();
  end if;
  execute sql;
  return 'ok';
exception when others then
  return 'error: ' || sqlerrm;
end;
$$;

-- Allow the service role to execute (RLS doesn't apply to functions
-- directly, but the role check above is the real gate).
grant execute on function public.vermilion_apply(text) to service_role;
