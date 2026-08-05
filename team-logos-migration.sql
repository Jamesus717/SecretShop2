-- Run this in Supabase SQL Editor.
-- Lets team captains upload their own logo during registration, instead of an
-- admin hand-dropping files into assets/teaminfoimgs/.
--
-- Uploaded logos go live on Team Info immediately (no approval step).

-- ── Storage bucket ────────────────────────────────────────────
-- Public read: team-info.html renders logos for signed-out visitors.
-- 1MB / raster-only: the client resizes to a 256px WEBP before upload, so
-- anything larger or of another type didn't come from our form. SVG is
-- deliberately excluded — it can carry script, and this bucket is public.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-logos', 'team-logos', true, 1048576, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Objects are stored at  <auth.uid()>/<filename>, so the folder check below
-- confines each captain to writing their own logo.
drop policy if exists "Public read team logo files" on storage.objects;
create policy "Public read team logo files"
on storage.objects for select
to public
using (bucket_id = 'team-logos');

drop policy if exists "Captains upload own team logo file" on storage.objects;
create policy "Captains upload own team logo file"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'team-logos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Captains update own team logo file" on storage.objects;
create policy "Captains update own team logo file"
on storage.objects for update
to authenticated
using (
  bucket_id = 'team-logos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Captains delete own team logo file" on storage.objects;
create policy "Captains delete own team logo file"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'team-logos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ── Logo lookup table ─────────────────────────────────────────
-- team_registrations has no public read policy (it holds full rosters), but
-- Team Info needs to map a team name from the Google Sheet to a logo without a
-- session — so the public part lives here on its own.
--
-- name_key is the team name normalised to [a-z0-9] (see logoKey() in
-- js/teamlogo.js); the sheet's casing and spacing drift from what was typed at
-- registration, so the raw name is not a reliable join key.
create table if not exists public.team_logos (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  team_name   text not null,
  name_key    text not null,
  logo_url    text not null,
  updated_at  timestamptz not null default now()
);

create index if not exists idx_team_logos_name_key on public.team_logos (name_key);

alter table public.team_logos enable row level security;

drop policy if exists "Public read team logos" on public.team_logos;
create policy "Public read team logos"
on public.team_logos for select
to public
using (true);

drop policy if exists "Insert own team logo" on public.team_logos;
create policy "Insert own team logo"
on public.team_logos for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Update own team logo" on public.team_logos;
create policy "Update own team logo"
on public.team_logos for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Delete own team logo" on public.team_logos;
create policy "Delete own team logo"
on public.team_logos for delete
to authenticated
using (auth.uid() = user_id);

-- Convenience copy so the logo is visible alongside the roster in the table editor.
alter table public.team_registrations
  add column if not exists logo_url text;
