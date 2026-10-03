-- Run this in Supabase SQL Editor.
-- News feed: match cards made by Owen's Discord bot (match-cards-bot, which
-- renders them with tools/stat-designer) also land on the home page "Latest"
-- sidebar.
--
-- The bot never touches Supabase directly. It POSTs each card to
-- functions/api/news.js with its own NEWS_BOT_TOKEN; that function checks the
-- token and writes here with the service role. So there is no insert policy
-- below — anon/authenticated can't write, only read.
--
-- Until this has run, the sidebar quietly stays hidden (the select fails) and
-- /api/news returns 500 on upload — see CLAUDE.md "Unapplied migrations".

-- ── Storage bucket ────────────────────────────────────────────
-- Public read: the home page shows cards to signed-out visitors.
-- 5MB, raster only: a 2× 1920×1080 PNG from the designer is ~2-3MB. SVG is
-- excluded on purpose — it can carry script, and this bucket is public.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('news-cards', 'news-cards', true, 5242880, array['image/png', 'image/webp', 'image/jpeg'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read news card files" on storage.objects;
create policy "Public read news card files"
on storage.objects for select
to public
using (bucket_id = 'news-cards');

-- ── Posts ─────────────────────────────────────────────────────
-- image_path is the object path inside the news-cards bucket, not a full URL,
-- so the page builds the URL itself and a bad row can't point it elsewhere.
-- dedupe_key: the bot sends one per card (e.g. "result:<series id>") so a
-- retried upload updates the existing post instead of posting it twice.
create table if not exists public.news_posts (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  kind        text not null default 'other'
              check (kind in ('result', 'match', 'elimination', 'bracket', 'hero', 'team', 'other')),
  title       text not null check (char_length(title) between 1 and 140),
  image_path  text not null,
  division    text check (division in ('upper', 'mid', 'lower')),
  teams       text[] not null default '{}',
  match_ids   bigint[] not null default '{}',
  dedupe_key  text unique,
  hidden      boolean not null default false
);

create index if not exists idx_news_posts_created on public.news_posts (created_at desc);

alter table public.news_posts enable row level security;

-- Everyone sees visible posts; admins also see hidden ones (so they can unhide).
drop policy if exists "Public read visible news posts" on public.news_posts;
create policy "Public read visible news posts"
on public.news_posts for select
to public
using (
  not hidden
  or exists (select 1 from admin_users where admin_users.user_id = auth.uid())
);

-- Admins can hide/unhide a wrong card from the home page.
drop policy if exists "Admins update news posts" on public.news_posts;
create policy "Admins update news posts"
on public.news_posts for update
to authenticated
using (exists (select 1 from admin_users where admin_users.user_id = auth.uid()))
with check (exists (select 1 from admin_users where admin_users.user_id = auth.uid()));

-- Belt and braces: even an admin's session can only flip `hidden`, not rewrite
-- a post's title or image from the browser.
revoke update on public.news_posts from authenticated;
grant update (hidden) on public.news_posts to authenticated;
