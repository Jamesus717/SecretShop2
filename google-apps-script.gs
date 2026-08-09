/**
 * SecretLeague registration sheet — Google Apps Script web app.
 *
 * This is the source of the /exec endpoint that js/register.js POSTs to and
 * js/teaminfo.js GETs from. It does NOT run from this repo — paste it into the
 * Apps Script editor for the sheet and redeploy. The copy here exists so the
 * two stay in sync and so changes are reviewable.
 *
 * After deploying a change, run setUpTeamColumns() once from the editor.
 */

const SHEET_ID = '16W6AZne1fhpOZikc4F-GOtk7mN9llXIx5u_vSBcCwfk';

const CAPTAIN_DISCORD_HEADER = 'Captain Discord';
const VISIBLE_HEADER = 'Visible';

const TEAM_HEADERS = [
  'Timestamp', 'Team Name', 'Captain', CAPTAIN_DISCORD_HEADER,
  'P1 IGN', 'P1 Steam', 'P1 Dotabuff', 'P1 Rank', 'P1 Pos',
  'P2 IGN', 'P2 Steam', 'P2 Dotabuff', 'P2 Rank', 'P2 Pos',
  'P3 IGN', 'P3 Steam', 'P3 Dotabuff', 'P3 Rank', 'P3 Pos',
  'P4 IGN', 'P4 Steam', 'P4 Dotabuff', 'P4 Rank', 'P4 Pos',
  'P5 IGN', 'P5 Steam', 'P5 Dotabuff', 'P5 Rank', 'P5 Pos',
  'Availability', VISIBLE_HEADER
];

// ── Column helpers ────────────────────────────────────────────
// Teams rows are read and written by header name rather than by fixed offset,
// so columns can be reordered or inserted in the sheet without breaking either
// the form or the website.

function headerMap(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return {};
  const map = {};
  sheet.getRange(1, 1, 1, lastCol).getValues()[0].forEach((h, i) => {
    const key = String(h).trim();
    if (key) map[key] = i;
  });
  return map;
}

// Adds a header to the end of row 1 if it isn't there yet. Returns its index.
function ensureColumn(sheet, header) {
  const existing = headerMap(sheet)[header];
  if (existing !== undefined) return existing;
  const col = sheet.getLastColumn() + 1;
  sheet.getRange(1, col).setValue(header);
  return col - 1;
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.openById(SHEET_ID);

  if (data.type === 'solo') {
    const sheet = ss.getSheetByName('Solo') || ss.insertSheet('Solo');
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Timestamp', 'IGN', 'Steam ID', 'Dotabuff', 'Discord', 'Rank', 'Position', 'Availability']);
    }
    sheet.appendRow([
      data.timestamp,
      data.ign,
      data.steam,
      data.dotabuff || '',
      data.discord,
      data.rank,
      data.position,
      data.availability || 'Not specified'
    ]);

  } else if (data.type === 'team') {
    const sheet = ss.getSheetByName('Teams') || ss.insertSheet('Teams');
    if (sheet.getLastRow() === 0) sheet.appendRow(TEAM_HEADERS);

    // Self-heal a sheet that predates these two columns.
    ensureColumn(sheet, CAPTAIN_DISCORD_HEADER);
    ensureColumn(sheet, VISIBLE_HEADER);

    const values = {
      'Timestamp': data.timestamp,
      'Team Name': data.teamName,
      'Captain': data.captainIgn || '',
      'Availability': data.availability || 'Not specified',
      // New teams start hidden — an admin flips this to 1 to publish them.
      [CAPTAIN_DISCORD_HEADER]: data.captainDiscord || '',
      [VISIBLE_HEADER]: 0
    };
    (data.players || []).forEach((p, i) => {
      const n = i + 1;
      values['P' + n + ' IGN']      = p.ign;
      values['P' + n + ' Steam']    = p.steam;
      values['P' + n + ' Dotabuff'] = p.dotabuff || '';
      values['P' + n + ' Rank']     = p.rank;
      values['P' + n + ' Pos']      = p.position;
    });

    const map = headerMap(sheet);
    const row = new Array(sheet.getLastColumn()).fill('');
    Object.keys(map).forEach((h) => {
      if (values[h] !== undefined) row[map[h]] = values[h];
    });
    sheet.appendRow(row);
  }

  return ContentService.createTextOutput('ok');
}

function doGet(e) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const result = { solo: [], teams: [] };

  try {
    const soloSheet = ss.getSheetByName('Solo');
    if (soloSheet && soloSheet.getLastRow() > 1) {
      const rows = soloSheet.getRange(2, 1, soloSheet.getLastRow() - 1, 8).getValues();
      rows.forEach((row, i) => {
        if (!row[0] && !row[1]) return;
        result.solo.push({
          id:           `solo-${i}`,
          timestamp:    row[0],
          ign:          row[1],
          steam:        row[2],
          dotabuff:     row[3],
          discord:      row[4],
          rank:         row[5],
          position:     row[6],
          availability: row[7]
        });
      });
    }
  } catch(err) {}

  try {
    const teamSheet = ss.getSheetByName('Teams');
    if (teamSheet && teamSheet.getLastRow() > 1) {
      const map = teamSheet.getLastColumn() ? headerMap(teamSheet) : {};
      const val = (row, name) => (map[name] === undefined ? '' : row[map[name]]);

      const rows = teamSheet
        .getRange(2, 1, teamSheet.getLastRow() - 1, teamSheet.getLastColumn())
        .getValues();

      rows.forEach((row, i) => {
        if (!val(row, 'Timestamp') && !val(row, 'Team Name')) return;
        const captainName = val(row, 'Captain');
        const players = [];
        for (let p = 1; p <= 5; p++) {
          const ign = val(row, 'P' + p + ' IGN');
          if (!ign) continue;
          players.push({
            ign:       ign,
            steam:     val(row, 'P' + p + ' Steam'),
            dotabuff:  val(row, 'P' + p + ' Dotabuff'),
            rank:      val(row, 'P' + p + ' Rank'),
            position:  val(row, 'P' + p + ' Pos'),
            isCaptain: ign === captainName
          });
        }
        result.teams.push({
          id:           `team-${i}`,
          teamName:     val(row, 'Team Name'),
          captain:      captainName,
          timestamp:    val(row, 'Timestamp'),
          availability: val(row, 'Availability'),
          // 1 = published, 0 = hidden. Blank means the row predates the column,
          // and the website treats blank as visible.
          visible:      val(row, VISIBLE_HEADER),
          players
          // Captain Discord is deliberately NOT returned — this endpoint is
          // public, and it's an admin contact detail, not roster info.
        });
      });
    }
  } catch(err) {}

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * One-time setup — run from the Apps Script editor (Run ▸ setUpTeamColumns).
 *
 * Adds the Captain Discord and Visible columns if missing, then marks every
 * team that already exists as visible (1) so nothing vanishes from the site.
 * Safe to re-run: it only fills blank Visible cells, so a team you've
 * deliberately hidden with a 0 stays hidden.
 */
function setUpTeamColumns() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Teams');
  if (!sheet) throw new Error('No "Teams" sheet found.');

  ensureColumn(sheet, CAPTAIN_DISCORD_HEADER);
  const visibleIdx = ensureColumn(sheet, VISIBLE_HEADER);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const range = sheet.getRange(2, visibleIdx + 1, lastRow - 1, 1);
  const filled = range.getValues().map(([v]) => [v === '' || v === null ? 1 : v]);
  range.setValues(filled);
}
