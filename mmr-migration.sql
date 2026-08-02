-- Run this in Supabase SQL Editor
-- Adds an mmr column alongside the existing rank text column (rank is now derived
-- from mmr client-side and still stored for display/filtering compatibility).
-- team_registrations.players is jsonb, so it needs no schema change — new entries
-- will just include an "mmr" key inside each player object going forward.

alter table public.solo_registrations add column if not exists mmr integer;
alter table public.profiles add column if not exists mmr integer;
