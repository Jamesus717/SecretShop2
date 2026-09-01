Local/preview test fixtures for standings.html (`?mock=1`).

Populate with the site's own public proxy output — no Imprint key needed,
since the Cloudflare Function holds the real key server-side:

    curl https://secretshopdota.co.uk/api/imprint/teams   -o mock-data/imprint-teams.json
    curl https://secretshopdota.co.uk/api/imprint/players -o mock-data/imprint-players.json
    curl https://secretshopdota.co.uk/api/imprint/heroes  -o mock-data/imprint-heroes.json

(PowerShell: use `Invoke-WebRequest <url> -OutFile <path>` instead of curl.)

These are point-in-time snapshots, not live data — re-run the commands above
to refresh them. Fine to delete this whole folder before merging to main.

`imprint-heroes.json` ships as a small hand-built fixture (24 heroes spread
across win-rate bands) rather than a live pull, so the Trends tab has
something to show with `?mock=1` before you've run the Supabase migrations
or set up SUPABASE_SERVICE_ROLE_KEY. Swap it for a real snapshot with the
curl command above whenever you want.

Note: `?mock=1` never touches Supabase's league_data_cache table or
functions/api/imprint-sync.js — it reads teams/players/heroes straight from
these three files, so it's a fully offline way to preview Standings/Trends.
