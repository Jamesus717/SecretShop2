-- Run this in Supabase SQL Editor.
-- Clip queue (option B, docs/clip-queue-design.md): members submit clips
-- through Owen's Discord bot, any admin approves them on /clips (or with a
-- Discord button), and Owen's PC pulls the approved ones, renders them in the
-- Highlight Cutter and posts them.
--
-- Nothing writes here from a browser. The bot and Owen's PC call
-- functions/api/clips with CLIPS_BOT_TOKEN, admins call it with their session,
-- and the function writes with the service role. So, like news_posts, there
-- are no insert/update policies below.
--
-- Until this has run, /api/clips returns 502 on every call and /clips shows
-- "Couldn't load clips" — see CLAUDE.md "Unapplied migrations".

-- ── Storage bucket ────────────────────────────────────────────
-- Discord attachment links expire within a day, so the bot uploads those
-- files instead of sending a link. PRIVATE: clips aren't public until an admin
-- approves them; /api/clips hands out 1-hour signed links to admins and Owen.
-- Files are deleted when a clip is rejected or posted, so the free 1GB doesn't
-- fill. 50MB is the free plan's per-file cap.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clip-files', 'clip-files', false, 52428800, array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
-- No storage.objects policies: only the service role touches this bucket.

-- ── Submissions ───────────────────────────────────────────────
-- Exactly one of link / file_path, until the clip is rejected or posted and
-- its file is deleted.
-- reviewed_by is the deciding admin's Discord name, whether they approved or
-- rejected; reviewed_via says where they clicked.
-- discord_message_id: the bot sends the /clip message's id so a retried
-- request doesn't add the clip twice.
create table if not exists public.clip_submissions (
  id                    bigint generated always as identity primary key,
  created_at            timestamptz not null default now(),
  submitter_discord_id  text not null check (submitter_discord_id ~ '^[0-9]{5,25}$'),
  submitter_name        text not null check (char_length(submitter_name) between 1 and 64),
  link                  text check (link is null or (link ~ '^https://' and char_length(link) <= 500)),
  file_path             text,
  teams                 text[] not null default '{}',
  match_id              bigint,
  description           text not null default '' check (char_length(description) <= 500),
  status                text not null default 'pending'
                        check (status in ('pending', 'approved', 'rejected', 'posted')),
  reviewed_by           text check (char_length(reviewed_by) <= 64),
  reviewed_via          text check (reviewed_via in ('site', 'discord')),
  reviewed_at           timestamptz,
  reject_reason         text check (char_length(reject_reason) <= 300),
  posted_at             timestamptz,
  post_urls             text[] not null default '{}',
  discord_message_id    text unique,
  check (status in ('rejected', 'posted') or ((link is null) <> (file_path is null)))
);

create index if not exists idx_clip_submissions_status on public.clip_submissions (status, created_at);
create index if not exists idx_clip_submissions_submitter on public.clip_submissions (submitter_discord_id, status);

alter table public.clip_submissions enable row level security;

-- Admins only. /clips reads through the function anyway (it needs the signed
-- file links); this just keeps the table closed to everyone else.
drop policy if exists "Admins read clip submissions" on public.clip_submissions;
create policy "Admins read clip submissions"
on public.clip_submissions for select
to authenticated
using (exists (select 1 from admin_users where admin_users.user_id = auth.uid()));
