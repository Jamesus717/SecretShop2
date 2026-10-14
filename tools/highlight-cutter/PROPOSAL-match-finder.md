# Proposal: Find matches

Hi Owen. You said finding the match ids for a VOD is the slowest part. This is a first go at doing
it for you. It's on a **local branch only** (`james/match-finder`, made from your
`feature/highlight-cutter`). Nothing has been pushed and your branch hasn't been touched. Take it,
change it or bin it.

## What it does

1. A scanned video gets a new **Find matches** button under **Videos**.
2. It works out the night the VOD was streamed. For Twitch downloads it asks yt-dlp for the stream's
   date. For anything else it uses the file's date, and says so, so you can change it.
3. It lists every league game from that night.
4. It pairs each game the scan found with a league game **by length**. That's the same test you
   already use to sync a game to its video, with the same 60-second leeway.
5. You get a table: where each game is in the VOD, its length, and a dropdown with the suggested
   match (teams, length, how many seconds off). If two games that night are within 20 seconds of each
   other, it's flagged so you check the teams.
6. **Use these** saves it:
   - A match that's already in a series (say, from **From schedule…**) gets this video as its source.
   - Any other match becomes a new series, one per team pair, games in the order played, with the
     video already picked and the match data loaded.

Nothing is saved until you press **Use these**.

## Where the night's games come from

- **The site's match cache first**, the same data **From schedule…** reads. It's instant, but it's
  playoff games only, and only the ones Imprint parsed.
- **OpenDota, for any game still unmatched.** The catch: OpenDota doesn't list SecretLeague's games
  by league. League 19942 is in its "excluded" tier, so `/leagues/19942/matches` comes back empty.
  League lobbies *are* in each player's own match history, though. So it takes one player per team
  (teams that played that night first), lists their lobby games that night, and keeps the ones
  OpenDota says are league 19942. Each match found ticks off all ten players in it, so it usually needs
  only a few lookups. It stops at 12, which is well under OpenDota's 60 a minute.

This also covers group-stage nights and the games Imprint missed, which **From schedule…** can't
see.

## Tested

- Against real games from 6 Oct, with a made-up scan whose game lengths were a few seconds off. It
  picked the right match ids (4s and 3s off), and left a fake 16-minute game unmatched.
- In the page, against the live match cache plus OpenDota. **Use these** made one series with both
  games in order and the video set, and it synced.
- **Not tried on a real VOD yet.** That needs your machine and a real scan.

## Files

- `lib/matchfinder.mjs`: new. Works out the VOD's date, gathers the night's games, pairs them by length.
- `serve.mjs`: one new route, `POST /api/find-matches`.
- `app.js`: the button and the **Find matches** view. Same pattern as **From schedule…**.
- `README.md`: one paragraph.

## Open questions for you

- Is the "night" window right? It's 10:00 UTC to 06:00 UTC the next day, so late games still count.
- Should a 1- or 2-game new series default to Bo3 like everything else? That's what it does now.
- Games OpenDota found have its team names, not the site's ("Radiant" when a team didn't set a
  name). Worth mapping them through the site's team list?
