-- Run this in Supabase SQL Editor
-- Lets the Register page check "has this Steam ID already registered solo?" without
-- exposing pending/rejected registrations (solo_registrations is only publicly
-- readable when status = 'approved', by design).

create or replace function public.solo_steam_id_registered(p_steam_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1 from public.solo_registrations where steam_id = p_steam_id
  );
$$;

grant execute on function public.solo_steam_id_registered(text) to anon, authenticated;
