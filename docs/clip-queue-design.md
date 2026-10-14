# Clip queue (option B) — design for Owen

**In one line:** the bot sends each clip to the website, any admin approves it (on the site or with a Discord button), and your PC pulls the approved ones, renders them in the Highlight Cutter and posts them.

```
member: /clip in Discord ─► bot ─► POST /api/clips ─► clip_submissions (pending)
admin: Approve on /clips page, or ✅ button in Discord ─► approved
your PC: GET /api/clips?status=approved ─► render + Buffer ─► POST /api/clips/:id/posted
```

## The table: `clip_submissions` (Supabase)

| Column | What it holds |
|---|---|
| `id`, `created_at` | automatic |
| `submitter_discord_id`, `submitter_name` | who sent it (for credit and spam limits) |
| `link` | the clip URL (Twitch clip, YouTube, Medal, Streamable…), **or** |
| `file_path` | a Discord attachment the bot uploaded (see Q2) |
| `teams` (list), `match_id` (optional), `description` (≤500 chars) | what's in it |
| `status` | `pending` → `approved` / `rejected` → `posted` |
| `reviewed_by`, `reviewed_via`, `reviewed_at`, `reject_reason` | which admin decided (approve **or** reject), as their Discord name, and where (`site` / `discord`) |
| `posted_at`, `post_urls` | filled when your PC posts it |
| `discord_message_id` (unique) | so a bot retry doesn't add the clip twice |

Only admins can read it. Nobody's browser can write to it — every write goes through the Pages Function, same as the news feed.

## The API: `/api/clips` (one Pages Function)

Auth is a new secret, **`CLIPS_BOT_TOKEN`**, shared by your bot and your PC (separate from `NEWS_BOT_TOKEN`, so rotating one doesn't break the other). Admins on the site send their login session instead.

| Call | Who | Does |
|---|---|---|
| `POST /api/clips` | bot | add a clip. JSON `{link, submitter_discord_id, submitter_name, teams, match_id, description, discord_message_id}`, or multipart with a `file` instead of `link`. → `201 {id}` |
| `POST /api/clips/:id/review` | bot or admin | `{decision: "approve"\|"reject", reviewer, reason}`. The bot passes the Discord admin's name as `reviewer`; for site admins it's taken from their profile. |
| `GET /api/clips?status=approved` | bot/PC or admin | list clips, oldest first. Uploaded files come with a download link valid for 1 hour. |
| `POST /api/clips/:id/posted` | PC | `{post_urls}` — marks it posted and deletes the stored file. |

Guard rails: https links to public sites only (no IPs/localhost, since your PC downloads them); Discord CDN links refused (they expire — upload the file instead); files max 50MB, MP4/WEBM/MOV only; max 10 pending clips per member; a repeated `discord_message_id` returns the existing clip instead of adding it twice. Only the bot can submit. An approved clip can still be rejected until it's posted; **rejecting is final** (an uploaded file is deleted). Every route, field and status code is listed at the top of `functions/api/clips/[[route]].js`.

## Open questions — my recommendation for each

1. **Queue on the site or only in the bot? → The site.** Clips are safe even when the bot's hosting is down or moves (AWS/Azure), admins can approve from a browser, and your PC pulls over plain HTTPS. It's the same pattern as `/api/news`, which already works.
2. **Store links or copy the files? → Links, except Discord attachments.** Twitch/YouTube/Medal links last; yt-dlp handles them. Discord attachment links expire within a day, so the bot downloads the attachment and sends the file itself. We keep it in a private Supabase bucket and delete it once posted, so the free 1GB never fills.
3. **How does approving work? → Both.** I'll build an admin-only `/clips` page (watch the clip, Approve / Reject). Your bot can add ✅/❌ buttons in a mod channel that call the same `review` endpoint — **the bot must check the clicker has the admin role**, since the site trusts the bot's token.
4. **How does your PC pull? → An Inbox tab in the cutter**, not a separate script: it lists approved clips, one click loads a clip into "Submitted clips → Short", and posting through Buffer marks it posted. No extra program to keep running.
5. **Is the `tools/stat-designer` change on your branch meant to go live? → Your call.** It changes the bot's cards, so it's kept out of this work. Tell us yes/no before `feature/highlight-cutter` merges to main.

**One change from the brief:** fetching approved clips does **not** mark them posted. If a render or Buffer post fails halfway, the clip would be lost. Instead the cutter says "posted" only after it really posted.

## What I build vs what you build
- **Me (site):** the migration SQL (`clips-migration.sql`), `functions/api/clips`, the `/clips` admin page. Built 2026-10-14.
- **You (bot + cutter):** the `/clip` command, the Discord approve buttons (optional), the Inbox tab.
