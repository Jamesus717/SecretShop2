-- Run this in Supabase SQL Editor (after news-migration.sql).
--
-- thumb_path: a small (~640px WEBP) copy of the card in the same news-cards
--   bucket. The sidebar and /news grid load this instead of the full card,
--   which from the bot is a ~3MB PNG. Posts without one fall back to the full
--   image, and the first admin to open the home page fills it in from their
--   browser (see backfillThumbs() in js/newsfeed.js).
-- youtube_id: a series highlights video (Owen's highlight cutter output).
--   Only the 11-character video id is stored, never a URL, so a bad value
--   can't point the embed anywhere but YouTube.
-- Safe to re-run.

alter table public.news_posts add column if not exists thumb_path text;
alter table public.news_posts add column if not exists youtube_id text;

alter table public.news_posts drop constraint if exists news_posts_youtube_id_check;
alter table public.news_posts add constraint news_posts_youtube_id_check
  check (youtube_id is null or youtube_id ~ '^[A-Za-z0-9_-]{11}$');

-- Admins' browsers may now set a video as well as hide/unhide. Still nothing
-- else: titles, images and thumbnails only change through /api/news.
revoke update on public.news_posts from authenticated;
grant update (hidden, youtube_id) on public.news_posts to authenticated;
