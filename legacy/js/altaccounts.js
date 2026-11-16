// Second Dotabuff accounts.
//
// Some players smurf or play the league on an account other than the one they
// registered with. This maps a player we already know about to their other
// profile, so the site can offer both links instead of people asking in
// Discord. It is display only — nothing here affects stats. Games played on a
// second account are counted against that account by Imprint, exactly as they
// are now; this does not merge them.
//
// Key by whichever id the page has to hand — the registration sheet carries a
// steam64 ("765611...") and Imprint carries the 32-bit account id. Both forms
// of the same player can be listed; add either, or both.
//
// The number in a Dotabuff URL (dotabuff.com/players/106214458) is the 32-bit
// account id. steam64 = account id + 76561197960265728.
export const ALT_ACCOUNTS = {
  // Immoral (The Bortymites, pos 4). Registered on 713653325 / 76561198673919053.
  '713653325': [{ id: '106214458', label: 'Alt' }],
  '76561198673919053': [{ id: '106214458', label: 'Alt' }]
};

/**
 * Extra profiles for a player, as [{ url, label }]. Pass any ids a page has
 * (steam64, account id); unknown or blank ids just return nothing.
 */
export function altAccountsFor(...ids) {
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    for (const alt of ALT_ACCOUNTS[String(id ?? '').trim()] || []) {
      if (seen.has(alt.id)) continue;
      seen.add(alt.id);
      out.push({ url: `https://www.dotabuff.com/players/${alt.id}`, label: alt.label || 'Alt' });
    }
  }
  return out;
}
