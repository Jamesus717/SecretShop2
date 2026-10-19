# Overnight clip pipeline: plan (doc only, nothing built)

**Goal:** Borty's PC turns last night's SecretLeague games and approved community clips into Shorts
overnight and queues them for TikTok, YouTube Shorts and Instagram. Only sources we have permission
for. A person still approves before anything is posted publicly.

```
 match night VOD ─┐                                   ┌─> Buffer queue ─> TikTok / YT Shorts / Insta
                  ├─> scan → load → auto-pick → render ┤
 /api/clips ──────┘   (highlight cutter on Borty's PC)  └─> mark posted on /api/clips
 (approved clips)
```

## What already exists

| Step | Exists? | Where |
|---|---|---|
| Community clips queue + admin approval | **Yes, live** | Site `/clips` page, `functions/api/clips` (`GET ?status=approved` with `CLIPS_BOT_TOKEN`, `POST /:id/posted`) |
| Owen's bot filling the queue from Discord | Built by Owen, **not hooked up yet** | Owen's `match-cards-bot` (outside repo). Nothing received as of 18 Oct |
| Finding a night's series + match ids | **Yes** | Cutter **From schedule…** (playoffs only, from the site cache), `james/match-finder` for scanned VODs (waiting on Owen) |
| Download VOD | **Yes** | Cutter `POST /api/download` (yt-dlp) |
| Scan (clock + caster volume) | **Yes**, ~5 min for a 3-hour VOD | `POST /api/scan` |
| Load games + auto-pick clips | **Yes**, improved on `james/clip-quality` | `POST /api/project/:id/game/:n/load` |
| Render Shorts | **Yes**, ~20 s per Short with NVENC | `renderShorts()`; submitted clips via `POST /api/short` |
| Short overlays (banner, crests) | **Only drawn in the browser** | `app.js` draws them on a canvas just before rendering. Headless renders get none |
| Captions | **Yes** (whisper in ffmpeg) | Needs `whisper.model` in `config.json` |
| Title + caption text | **Yes** (templates) | `posting/suggest`, `lib/postcopy.mjs` (PR #2) |
| Post to Buffer (upload via R2) | **Yes** | `lib/social.mjs` `publish()`. Buffer key + R2 keys are **Owen's**, in his `config.json` |
| Pull approved clips into the cutter | **No** | The "Inbox tab" from the clip-queue design isn't built |
| One command that does all of it | **No** | Everything is a button in the page today |
| Running on a schedule | **No** | |

## What's missing (in build order)

1. **A headless "night" script** `tools/highlight-cutter/night.mjs` that calls the same lib functions as
   the buttons: find the night's series (From schedule) → download each VOD → scan → load games →
   render the ticked Shorts → delete the VOD afterwards (VODs are 4–7 GB each). Writes a log and a
   `night-<date>.json` listing what it made. ~1 evening.
2. **Overlays without the browser.** Either (a) open the cutter page in headless Edge/Chrome
   (Playwright) and press the overlay step, or (b) cache one overlay PNG per team-pair and banner preset
   the first time it's drawn by hand. (b) is cheaper and has no extra dependency; new teams fall back
   to the plain league banner. ~1 evening.
3. **Inbox:** pull `GET /api/clips?status=approved`, download each link / attachment, render with
   `POST /api/short` logic, keep the clip id with the file. ~half an evening.
4. **Post step, held for approval.** Default: put the night's Shorts in Buffer as **drafts** (or as a
   queue at 2 slots/day) so a person checks them in the morning. After Buffer accepts one, call
   `POST /api/clips/:id/posted` for queue clips. Fully automatic posting only once a few nights look right.
5. **Schedule:** Windows Task Scheduler, daily at 02:00, "wake the computer to run", runs
   `node night.mjs` with `HC_DATA`, `FFMPEG`, `FFPROBE` set. Needs the PC asleep (not off) and
   Windows' "allow wake timers" on. Free.
6. **Morning report:** a small text/HTML summary (what was rendered, what's waiting in Buffer, what
   failed) in the data folder, plus an optional Discord webhook ping. Nice to have.

## Cheapest setup

- **Rendering:** Borty's PC (NVENC, ffmpeg 9 with whisper). £0. Cloud rendering isn't worth it:
  YouTube blocks yt-dlp from cloud IPs and VODs are several GB.
- **Storage for Buffer uploads:** Cloudflare R2. The free tier covers this volume (a few hundred MB
  a night, deleted after posting). Check the current free allowance before relying on it.
- **Posting:** Buffer. Its free plan has a small number of channels and a cap on queued posts per
  channel; 3 channels at 2 Shorts/day fits only if the queue is refilled every few days. **Check
  Buffer's current free-plan limits and whether its API works on the free plan before deciding.**
- **The one real choice is whose Buffer.** Owen's account and keys post to the channels he connected.
  Borty's own account means connecting the SecretLeague TikTok/YouTube/Insta himself (needs the
  admins' OK for the league's channels) or making his own channels.

## Risks

- **Replays expire after ~2 weeks.** If OpenDota hasn't parsed a game, the night script must ask it to
  parse and retry the next night, not skip it for good.
- **Clock reader on a new HUD/stream layout** can fail to sync. The script should report it and carry on
  with the other games.
- **Posting without a look** risks a bad clip (wrong game, spoiler in the title) going out on the
  league's account. Keep the morning approval until it has run cleanly for a week or two.
- **Owen's code and accounts.** The cutter is his. The night script and any change go to his branch
  as PRs, and nothing posts from his Buffer without his yes.

## Decisions needed

1. Whose Buffer (and which channels) the overnight Shorts go to.
2. Drafts for morning approval (recommended) vs straight into the posting queue.
3. Build order: night script + cached overlays first (recommended), or the Inbox first.
