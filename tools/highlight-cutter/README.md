# Highlight Cutter

Turns league VODs (or replays of games nobody streamed) into:

- **one YouTube video per series**, always the same length (30:00 by default), so the runtime
  never gives away whether it went to game 3. It's built from highlight clips, your Stat Designer
  cards between games, and a padding card at the end;
- **Shorts** (9:16, under a minute): one per moment you tick, with a SecretLeague header and footer.

The clips are chosen from the match data (OpenDota), not by watching the video. The app reads the
in-game clock off the VOD so it knows where each moment is, skips pauses, and lets a clip run on
while the casters are still shouting.

---

## Setup

1. **Node.js 18+**, **ffmpeg** (`winget install Gyan.FFmpeg`) and **yt-dlp**
   (`winget install yt-dlp.yt-dlp`, only needed for Twitch downloads).
2. Double-click **`launch.bat`**. It opens <http://localhost:8735/tools/highlight-cutter/>.

Everything big goes in **`D:\Videos\SecretShop`**, not in the repo:

| Folder | What's in it |
|---|---|
| `media\` | Downloaded VODs and replay recordings. **This is the bit to delete when you're done.** |
| `output\<series>\` | The rendered YouTube video, with the Shorts in `shorts\` |
| `posting\`, `music\` | Files dragged into the Post tab, and tracks for photo posts |
| `projects\`, `assets\`, `cache\` | Series setups, cards, OpenDota data and clock scans (all small) |

To use another folder, run `launch.bat "E:\Somewhere"` (or set `HC_DATA`).

### Deleting downloads
- One file: press **Delete** next to it under **Videos**.
- All of them: double-click **`delete-downloads.bat`**. It lists what it will remove and asks first.
  Rendered videos are kept.

---

## Making a series video

1. **Get the video.** Paste a Twitch VOD link under **Videos** and press **Download**, or put your own
   file in `D:\Videos\SecretShop\media`. Then press **Scan**. That reads the clock and caster volume
   and takes a few minutes for a 2-hour VOD, mostly reading from disk.
2. **New series** → **+ Add game** for each game. Paste the **match id** (the league page and Imprint
   have them), and pick the video it was played in. One VOD can hold several games: the app works
   out which game is which from the game length. The badge turns green: *synced: VOD 19:56 → 51:40*.
3. **Review the clips.** Each moment has a score. The best ones are ticked for **YT** up to the length
   budget (target ÷ best-of). Tick **Short** for the ones you want as Shorts. Press **▶** to preview.
   **−3 / +3** move a clip's start or end. Clip ends stretch while the casters are still loud, unless you
   trim the end yourself. The gold blocks on the timeline are the ticked clips.
   **+ Draft** adds a 30s clip of the finished draft screen, the one with all ten heroes up, which
   goes straight after the game's title card. The draft has no game clock, so its spot is guessed from
   where the clock starts. On our broadcasts that's about 2 minutes earlier. If the guess is off, see below.
   **+ Custom moment** opens the video: scrub to the bit you want, press **Mark in** and **Mark out**,
   name it and press **Add moment**. To fix a clip, press **▶** on it, re-mark, and press
   **Update moment** (custom ones) or **Save my version** (auto ones; the auto clip is unticked so
   nothing plays twice). Draft and custom moments play exactly as marked, with no caster stretch.
   They survive **Reload match** and **Auto-pick again**. They're stored as VOD times, so if you switch a
   game to a different video, mark them again.
4. **Cards.** Export from the Stat Designer in **16:9** and drop the PNGs in: a VS card as the intro,
   the Result card after each game, and so on. Empty "before game" slots get an auto **GAME 1** title
   card, and the padding card is drawn automatically too.
5. **Render.** The line above the buttons shows how long the highlights are and how much padding gets
   added. **Render YouTube video** / **Render Shorts** → files appear in `output\`.

**Shorts framing:** *Close* is taller than square (fight biggest, crops into the hero bar and HUD sides),
*Tight* is a square crop (the size big tournaments' Shorts use; loses the minimap), *Zoom* trims the side
HUD, *Full* keeps the whole frame small. The closer the framing, the smaller the header and footer bands. **Preview a Short overlay** shows the header/footer art.

### How clips are chosen
`lib/moments.mjs` groups kills less than 20s apart into one moment and scores it. Kills, extra kills in
a fight, multi-kills, Roshan, Aegis steals, barracks, comebacks against a 5k+ gold deficit and the
final push all add points, and anything after 30:00 counts a bit more. The weights are at the top of
that file. Lone pick-offs (score 10) aren't auto-ticked.

### If a game won't sync
- *video not scanned yet*: press **Scan** next to the video.
- *No game in this video has a matching length*: the match id is probably for a different game, or the
  VOD cuts off before the ancient falls.
- The clock reader is trained on the spectator HUD at 1080p (`lib/clock-templates.json`). If Valve
  changes the font, retrain it on any stretch of gameplay with no pause, giving the VOD time and the
  clock reading at that moment:
  `node lib/clock.mjs calibrate <video> <vodSeconds> <clockSeconds> 600`

### If OpenDota hasn't parsed a match
Loading the game asks OpenDota to parse it; try again a few minutes later. Valve deletes replays after
about two weeks, so load each match soon after it's played.

---

## Submitted clips → Shorts

For clips people send in, with no match id needed:

1. Get the clip into **Videos**: paste the Twitch clip link and press **Download**, or copy the file into
   `D:\Videos\SecretShop\media` and reload the page.
2. Press **Make Short** next to it. The left side shows a live 9:16 preview.
3. Pick the **framing**: *Close*, *Tight*, *Zoom* or *Full frame*. If the action is off-centre, use the
   **Left / right** slider.
4. Type the **small line**, **big line** and **footer** if you want them. Any of them can be blank.
5. Optionally **trim**: play the clip and press **= playhead** for the start and end.
6. **Export Short**. The file goes to `output\clips\`.

Each clip remembers its settings in your browser, so you can come back and export it again.

### Banners and team crests
The header and footer on every Short come from a **banner preset**. **Shorts banners** in the sidebar
opens the editor, with a live preview over a real gameplay frame. A preset is:
- **Small line, big line, footer**, with placeholders: `{teamA}` `{teamB}`, `{moment}` and `{game}` (series
  Shorts), and `{league}`. A part between ` · ` whose placeholder is empty is left out, so
  `{league} · GAME {game}` on a submitted clip is just `SECRETLEAGUE`.
- **SecretLeague logo** on or off.
- **Division badge**: a pill in the division's colour (upper gold, mid teal, lower red, same as the site)
  under the header, under the logos on thumbnails, and under the teams on game title cards. There's also
  a `{division}` placeholder ("Upper Division"). Each series picks its division under **Render**. It's
  guessed from the series title ("… - Upper Div") until you change it. Clips have their own
  **Division** choice in the Text card.
- **Team crests**: beside the league logo, either side of the small line, either side of the footer, or off.
  Thumbnails put them beside the top logo. They come from the website (the captain's uploaded logo, then
  `assets/teaminfoimgs/`), so adding a crest to the site adds it here.

Presets are saved in `D:\Videos\SecretShop\banners.json`. Before you save any, *Series* and
*Community clip* are built in.
- **Series:** pick the preset under **Render** (*Shorts banner*). The game title cards get the crests too,
  unless the preset has them off. The **Crests** line shows which team got which crest. If a team's
  name in the match data doesn't find one, type its name as registered on the site in the box there.
- **Submitted clips:** choose a **Preset** in the Text card (it keeps your own big line), and type
  **Team A / Team B** to get their crests.

### Thumbnails
Each Short can have a matching 1080×1920 JPG: a darkened frame with the **big line** huge in the middle.
- **Submitted clips:** switch the preview to **Thumbnail**, pause on the frame you want, then press
  **Export thumbnail**. It's saved next to the Short as `…-thumb.jpg`.
- **Series Shorts:** a thumbnail is made automatically next to each Short (same name, `.jpg`), from
  about 70% of the way through the clip.

The thumbnail is also the Short's first three frames (a 1/20s blink). Discord and most chat apps show a
video's first frame as its preview, and clips fade in from black, so without it the preview is a black
box. For submitted clips, export the thumbnail **before** the Short. A Short exported without one
says so, so you know to export it again.

---

## Posting (TikTok, Instagram, YouTube Shorts)

**Post to TikTok / Instagram / Shorts** at the top of the sidebar opens the Post tab. It posts through
[Buffer](https://publish.buffer.com). X is still done by hand: **Copy caption**, then drag the file in.

1. **Pick what to post.** Rendered Shorts and clips are already listed (or press **Post…** next to one
   after rendering). Drag in anything else: photos (jpg, png, webp) or videos (mp4, mov). Pick one video,
   or up to ten photos.
2. **Caption, hashtags, title.** Hashtags are remembered. YouTube needs a title; blank uses the caption's
   first line.
3. **Tick the platforms** (the channels connected in Buffer), choose **when**, and press **Send to Buffer**.
   The list at the bottom is read back from Buffer: what's queued, what went out, and any errors.
   Queued posts can be deleted there.

**Cover frame:** Buffer can't take a separate cover image, only a time in the video, and only TikTok and
Instagram use it. Shorts made here start on their thumbnail, so the default (*first frame*) is the
designed thumbnail. For anything else, pause the preview on a good frame and press **Use the frame
showing**. A video that starts on black gets a warning. YouTube picks its own; change it in the YouTube app.

### Photos and sound
Buffer can't attach a sound to a post through its API, on any platform. For photos you choose:
- **Pick one in the app.** The post goes to Buffer as a *reminder*: at the time, Buffer pings your phone
  (Buffer mobile app needed), and you post it from TikTok/Instagram with a trending sound. The "sound to
  use" note shows on the Instagram reminder.
- **Our track.** The photos become a short 9:16 video (slow push-in, blurred fill) with a track from
  `D:\Videos\SecretShop\music`, and it posts automatically. Drag music files into the Post tab to add them.
  Only use music you have the rights to: claimed tracks get muted.
- **No sound.** Photos post automatically as photos.

YouTube only takes video, so photos always reach it as that short video. PNGs are converted to JPEG
first (Instagram and TikTok only accept JPEG through their APIs).

### One-off setup
Buffer has no upload: it fetches each file from a **public link**, which has to stay up until the post
goes out. So files are first copied to a Cloudflare R2 bucket (free tier: 10 GB, no egress fees).

1. **Buffer key:** publish.buffer.com → Settings → API. Connect TikTok, Instagram and YouTube as channels.
2. **R2:** Cloudflare dashboard → R2 → *Create bucket* (e.g. `secretshop-social`). In the bucket's
   *Settings*, turn on the **Public Development URL** (`https://pub-….r2.dev`). Then R2 → *Manage API
   tokens* → *Create API token* with **Object Read & Write** on that bucket only. It shows an access key
   id, a secret and the S3 endpoint.
3. Put them in `D:\Videos\SecretShop\config.json`, which is outside the repo, so the keys are never
   committed:
   ```json
   {
     "buffer": { "apiKey": "…" },
     "storage": {
       "endpoint": "https://<account id>.r2.cloudflarestorage.com",
       "bucket": "secretshop-social",
       "accessKeyId": "…",
       "secretAccessKey": "…",
       "publicUrl": "https://pub-….r2.dev"
     }
   }
   ```
   Keep any `"obs"` settings already in there. Restart `launch.bat`. The Post tab's status line should
   go green.

Files go to `social/<year-month>/` in the bucket and are never uploaded twice. They aren't deleted
automatically: once the posts are out, the bucket can be emptied from the Cloudflare dashboard.

---

## Games that weren't streamed (experimental)

**Record replay…** plays the replay in Dota and records just the ticked clips with OBS. The recording
then goes through the same scan and render as a VOD. It has no casters, but the same highlights.

One-off setup:
1. Steam → Dota 2 → Properties → Launch options: `-netconport 2121`
2. OBS → Tools → **WebSocket Server Settings** → enable (port 4455). If you keep authentication on, put
   the password in `D:\Videos\SecretShop\config.json`:
   `{ "obs": { "password": "…" } }`
3. In OBS, have a scene showing Dota (Game Capture), at 1920×1080 output, recording to MP4 or MKV.

Then start Dota, load the match in the cutter, tick the clips, and press **Record replay…**. The app
downloads the replay, starts it in Dota, jumps to each clip by reading the HUD clock from OBS
screenshots, and pauses the recording between clips. Set the replay camera to **Directed** before you
start, and leave Dota and OBS alone until it's done.

---

## Speed

Renders use NVENC on NVIDIA cards. ffmpeg 9 needs **NVIDIA driver 610 or newer**; with an older
driver it falls back to the CPU (x264). That works, just slower. A 30-minute series video takes
around 5–10 minutes either way. The Status box says which one it's using.
