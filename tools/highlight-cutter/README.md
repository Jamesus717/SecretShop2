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
4. **Cards.** Export from the Stat Designer in **16:9** and drop the PNGs in: a VS card as the intro,
   the Result card after each game, and so on. Empty "before game" slots get an auto **GAME 1** title
   card, and the padding card is drawn automatically too.
5. **Render.** The line above the buttons shows how long the highlights are and how much padding gets
   added. **Render YouTube video** / **Render Shorts** → files appear in `output\`.

**Shorts framing:** *Tight* is a square crop (fight biggest, loses the minimap), *Zoom* trims the side
HUD, *Full* keeps the whole frame small. **Preview a Short overlay** shows the header/footer art.

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
3. Pick the **framing**: *Tight*, *Zoom* or *Full frame*. If the action is off-centre, use the
   **Left / right** slider.
4. Type the **small line**, **big line** and **footer** if you want them. Any of them can be blank.
5. Optionally **trim**: play the clip and press **= playhead** for the start and end.
6. **Export Short**. The file goes to `output\clips\`.

Each clip remembers its settings in your browser, so you can come back and export it again.

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
