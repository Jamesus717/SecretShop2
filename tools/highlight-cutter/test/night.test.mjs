// node --test tools/highlight-cutter/test/
// Needs ffmpeg + ffprobe on PATH. Encodes with libx264 (CPU) on tiny generated clips.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CUTTER, tempData, sampleVideo, sampleMatch, seedMatch, seedScan, writeQueue, runNightCli } from './helpers.mjs';

process.env.HC_DATA ??= tempData().dir; // the modules read it once, on import
const { mergeSeries, reportText, nightOf, guardNetwork } = await import('../lib/night.mjs');
const { sheetRows, seriesForDate, isVideoLink, parseCSV } = await import('../lib/schedule.mjs');
const { fill, findCrest } = await import('../lib/overlay.mjs');
const { shortName, findMoment, clipCopy } = await import('../lib/postcopy.mjs');

const size = (f) => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', f]);
  const j = JSON.parse(r.stdout);
  return { w: j.streams[0].width, h: j.streams[0].height, d: +j.format.duration };
};
const nightFile = (data, date) => JSON.parse(readFileSync(join(data, 'night', `night-${date}.json`), 'utf8'));
const stateFile = (data) => JSON.parse(readFileSync(join(data, 'night', 'state.json'), 'utf8'));

test('a night run turns a VOD into checked Shorts and a report, and posts nothing', { timeout: 300000 }, async () => {
  const { dir, done } = tempData();
  const video = sampleVideo(join(dir, 'in', 'vod.mp4'));
  seedMatch(dir, sampleMatch(9000001));
  seedScan(dir, video);
  writeQueue(dir, [{ title: 'Crêpe stack vs Catwice - Upper Div', vod: video, matchIds: ['9000001'], division: 'upper' }]);
  const net = join(dir, 'net.log');
  const r = await runNightCli(dir, ['--date', '2026-11-02', '--no-schedule', '--no-inbox'], { HC_NET_LOG: net });
  assert.equal(r.code, 0, r.err);
  const n = nightFile(dir, '2026-11-02');
  assert.equal(n.series[0].status, 'done', JSON.stringify(n.series[0]));
  assert.ok(n.series[0].shorts.length >= 1);
  for (const s of n.series[0].shorts) {
    const v = size(s.file);
    assert.deepEqual([v.w, v.h], [1080, 1920]);
    assert.ok(existsSync(s.thumb));
    assert.equal(s.status, 'awaiting approval');
    assert.match(s.title, /Crêpe stack vs Catwice/);
  }
  // The overlays were drawn, under the names the page would use.
  const assets = readdirSync(join(dir, 'assets'));
  assert.ok(assets.some((f) => /-short-g1-m\d+\.png$/.test(f)) && assets.some((f) => /-thumb-g1-m\d+\.png$/.test(f)));
  const md = readFileSync(join(dir, 'night', 'night-2026-11-02.md'), 'utf8');
  assert.match(md, /Nothing here has been posted/);
  assert.equal(existsSync(net), false, 'made a network call');
  assert.equal(stateFile(dir).series['9000001'].status, 'done');
  // Second night: already done, so nothing new.
  const again = await runNightCli(dir, ['--date', '2026-11-03', '--no-schedule', '--no-inbox']);
  assert.equal(again.code, 0, again.err);
  assert.equal(nightFile(dir, '2026-11-03').series.length, 0);
  done();
});

test('an unparsed game is put off to the next night, and the VOD is not fetched', { timeout: 60000 }, async () => {
  const { dir, done } = tempData();
  writeQueue(dir, [{ title: 'A vs B', vod: 'https://www.twitch.tv/videos/123', matchIds: ['9000002'] }]);
  const net = join(dir, 'net.log');
  const r = await runNightCli(dir, ['--date', '2026-11-02', '--no-schedule', '--no-inbox'], { HC_NET_LOG: net });
  assert.equal(r.code, 0, r.err);
  const n = nightFile(dir, '2026-11-02');
  assert.equal(n.series[0].status, 'retry');
  assert.equal(stateFile(dir).series['9000002'].status, 'retry');
  // Only ever a read of OpenDota (refused here), never yt-dlp: that isn't installed under this name.
  assert.deepEqual(readFileSync(net, 'utf8').trim().split('\n'), ['GET https://api.opendota.com/api/matches/9000002']);
  assert.doesNotMatch(JSON.stringify(n.series[0]), /yt-dlp/);
  done();
});

test('one series failing does not stop the next', { timeout: 300000 }, async () => {
  const { dir, done } = tempData();
  const video = sampleVideo(join(dir, 'in', 'vod.mp4'), { seconds: 50, size: '320x180' });
  seedMatch(dir, sampleMatch(9000003));
  seedMatch(dir, sampleMatch(9000004));
  seedScan(dir, video);
  writeQueue(dir, [
    { title: 'Missing vs Video', vod: join(dir, 'in', 'gone.mp4'), matchIds: ['9000004'] },
    { title: 'Crêpe stack vs Catwice', vod: video, matchIds: ['9000003'] },
  ]);
  const r = await runNightCli(dir, ['--date', '2026-11-02', '--no-schedule', '--no-inbox']);
  assert.equal(r.code, 0, r.err);
  const [a, b] = nightFile(dir, '2026-11-02').series;
  assert.equal(a.status, 'retry');
  assert.match(a.reason, /missing/);
  assert.equal(b.status, 'done', JSON.stringify(b));
  done();
});

test('a game that will not sync is reported, and the rest of the series still renders', { timeout: 300000 }, async () => {
  const { dir, done } = tempData();
  const video = sampleVideo(join(dir, 'in', 'vod.mp4'), { seconds: 50, size: '320x180' });
  seedMatch(dir, sampleMatch(9000005));
  seedMatch(dir, sampleMatch(9000006, { duration: 900 })); // no 15-minute game in the scan
  seedScan(dir, video);
  writeQueue(dir, [{ title: 'Crêpe stack vs Catwice', vod: video, matchIds: ['9000005', '9000006'] }]);
  const r = await runNightCli(dir, ['--date', '2026-11-02', '--no-schedule', '--no-inbox']);
  assert.equal(r.code, 0, r.err);
  const s = nightFile(dir, '2026-11-02').series[0];
  assert.equal(s.status, 'partial', JSON.stringify(s));
  assert.ok(s.shorts.length);
  assert.match(s.problems.join(), /Game 2 .*didn't sync/);
  done();
});

test('dry run makes no calls and no files beyond its report', { timeout: 60000 }, async () => {
  const { dir, done } = tempData();
  writeQueue(dir, [{ title: 'A vs B', vod: 'https://www.twitch.tv/videos/123', matchIds: ['9000007'] }]);
  const net = join(dir, 'net.log');
  const r = await runNightCli(dir, ['--date', '2026-11-02', '--dry-run'], { HC_NET_LOG: net });
  assert.equal(r.code, 0, r.err);
  const n = JSON.parse(readFileSync(join(dir, 'night', 'night-2026-11-02-dry.json'), 'utf8'));
  assert.equal(n.series[0].status, 'planned');
  assert.match(n.series[0].planned, /would download/);
  assert.equal(existsSync(net), false, 'dry run reached for the network');
  assert.equal(existsSync(join(dir, 'night', 'state.json')), false);
  assert.equal(existsSync(join(dir, 'output')), false);
  done();
});

test('queue clips: uploaded clip rendered, portrait refused, nothing marked posted', { timeout: 300000 }, async () => {
  const { dir, done } = tempData();
  const land = sampleVideo(join(dir, 'in', 'land.mp4'), { seconds: 6, size: '640x360' });
  const tall = sampleVideo(join(dir, 'in', 'tall.mp4'), { seconds: 3, size: '360x640' });
  const hits = [];
  const srv = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url} ${req.headers.authorization || ''}`);
    if (req.url === '/api/clips?status=approved') {
      res.setHeader('content-type', 'application/json');
      const base = `http://127.0.0.1:${srv.address().port}`;
      return res.end(JSON.stringify({ clips: [
        { id: 11, description: 'Mad rampage', teams: ['Catwice', 'Farmville'], submitter_name: 'Bob', file_path: 'x/11.mp4', file_url: `${base}/f/land.mp4` },
        { id: 12, description: 'Phone filmed', submitter_name: 'Al', file_path: 'x/12.mp4', file_url: `${base}/f/tall.mp4` },
      ] }));
    }
    const f = { '/f/land.mp4': land, '/f/tall.mp4': tall }[req.url];
    if (f) return res.end(readFileSync(f));
    res.statusCode = 404; res.end('{}');
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ clips: { site: `http://127.0.0.1:${srv.address().port}`, token: 'test-token' } }));
  const r = await runNightCli(dir, ['--date', '2026-11-02', '--no-schedule']);
  assert.equal(r.code, 0, r.err);
  const { clips } = nightFile(dir, '2026-11-02');
  assert.equal(clips[0].status, 'awaiting approval', JSON.stringify(clips[0]));
  assert.deepEqual([size(clips[0].file).w, size(clips[0].file).h], [1080, 1920]);
  assert.match(clips[0].title, /^Mad rampage \| SecretLeague/);
  assert.match(clips[0].caption, /Clip by Bob/);
  assert.equal(clips[1].status, 'failed');
  assert.match(clips[1].reason, /Portrait/);
  assert.ok(hits[0].endsWith('Bearer test-token'));
  assert.ok(hits.every((h) => h.startsWith('GET ')), hits.join('\n'));
  // Tomorrow: the rendered one is left alone, the refused one is tried again.
  hits.length = 0;
  await runNightCli(dir, ['--date', '2026-11-03', '--no-schedule']);
  assert.deepEqual(nightFile(dir, '2026-11-03').clips.map((c) => c.clipId), [12]);
  // mark-posted is its own command, and sends the url.
  srv.removeAllListeners('request');
  let posted;
  srv.on('request', (req, res) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => { posted = `${req.method} ${req.url} ${b}`; res.setHeader('content-type', 'application/json'); res.end('{"id":11,"status":"posted"}'); }); });
  const m = await runNightCli(dir, ['mark-posted', '11', 'https://example.com/p']);
  assert.equal(m.code, 0, m.err);
  assert.equal(posted, 'POST /api/clips/11/posted {"post_urls":["https://example.com/p"]}');
  srv.close();
  done();
});

test('--delete-vods: one fetch for a shared VOD, gone only when every series using it is done', { timeout: 300000 }, async () => {
  const { dir, done } = tempData();
  const sample = sampleVideo(join(dir, 'in', 'Twitch-123.mp4'), { seconds: 50, size: '320x180' });
  seedMatch(dir, sampleMatch(9000009));
  seedMatch(dir, sampleMatch(9000010));
  seedScan(dir, sample);
  const url = 'https://www.twitch.tv/videos/123';
  writeQueue(dir, [{ title: 'One vs Two', vod: url, matchIds: ['9000009'] }, { title: 'Three vs Four', vod: url, matchIds: ['9000010'] }]);
  const fetches = join(dir, 'ytdlp.log');
  const env = { YTDLP: 'fake-yt-dlp', HC_FAKE_VOD: sample, HC_FAKE_LOG: fetches };
  const r = await runNightCli(dir, ['--date', '2026-11-02', '--no-schedule', '--no-inbox', '--delete-vods'], env);
  assert.equal(r.code, 0, r.err);
  const n = nightFile(dir, '2026-11-02');
  assert.deepEqual(n.series.map((s) => s.status), ['done', 'done'], JSON.stringify(n.series));
  assert.equal(readFileSync(fetches, 'utf8').trim().split('\n').length, 1, 'fetched twice');
  assert.deepEqual(readdirSync(join(dir, 'media')), []);
  assert.ok(n.notes.some((x) => /Deleted VOD Twitch-123/.test(x)));
  assert.ok(existsSync(sample), 'touched a file it did not fetch');

  // A series left unfinished keeps the VOD, even with the flag on.
  seedMatch(dir, sampleMatch(9000011));
  writeQueue(dir, [{ title: 'Five vs Six', vod: url, matchIds: ['9000011'] }, { title: 'Seven vs Eight', vod: url, matchIds: ['9000012'] }]);
  await runNightCli(dir, ['--date', '2026-11-03', '--no-schedule', '--no-inbox', '--delete-vods'], env);
  assert.deepEqual(nightFile(dir, '2026-11-03').series.map((s) => s.status), ['done', 'retry']);
  assert.deepEqual(readdirSync(join(dir, 'media')), ['Twitch-123.mp4']);
  done();
});

test('a second run is refused while one is going, a stale lock is not', { timeout: 60000 }, async () => {
  const { dir, done } = tempData();
  mkdirSync(join(dir, 'night'), { recursive: true });
  writeFileSync(join(dir, 'night', 'lock'), String(process.pid));
  const r = await runNightCli(dir, ['--date', '2026-11-02', '--dry-run']);
  assert.equal(r.code, 1);
  assert.match(r.err, /Another night run/);
  writeFileSync(join(dir, 'night', 'lock'), '999999');
  assert.equal((await runNightCli(dir, ['--date', '2026-11-02', '--dry-run'])).code, 0);
  assert.equal(existsSync(join(dir, 'night', 'lock')), false);
  done();
});

test('a clip with no audio track still renders', { timeout: 120000 }, async () => {
  const { dir, done } = tempData();
  const silent = sampleVideo(join(dir, 'in', 'silent.mp4'), { seconds: 4, audio: false });
  const srv = http.createServer((req, res) => {
    if (req.url.startsWith('/api/clips')) { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ clips: [{ id: 21, file_path: 'x/21.mp4', file_url: `http://127.0.0.1:${srv.address().port}/f` }] })); }
    res.end(readFileSync(silent));
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const r = await runNightCli(dir, ['--date', '2026-11-02', '--no-schedule'], { CLIPS_BOT_TOKEN: 't' });
  writeFileSync(join(dir, 'config.json'), '{}');
  srv.close();
  assert.equal(r.code, 0, r.err);
  assert.ok(true);
  done();
});

test('the page still renders a submitted clip after moving it to pipeline.mjs', { timeout: 120000 }, async () => {
  const { dir, done } = tempData();
  const clip = sampleVideo(join(dir, 'media', 'clip.mp4'), { seconds: 4 });
  const server = spawn(process.execPath, [join(CUTTER, 'serve.mjs'), '18791'], { env: { ...process.env, HC_DATA: dir }, windowsHide: true });
  try {
    await new Promise((ok, bad) => { server.stdout.on('data', (d) => /Highlight cutter/.test(d) && ok()); server.on('close', () => bad(new Error('server stopped'))); });
    const api = (p, body) => fetch(`http://127.0.0.1:18791/api/${p}`, body ? { method: 'POST', body: JSON.stringify(body) } : undefined).then((r) => r.json());
    let job = await api('short', { file: clip, title: 'Test clip', end: 3 });
    while (job.status === 'running') { await new Promise((r) => setTimeout(r, 300)); job = await api(`job/${job.id}`); }
    assert.equal(job.status, 'done', job.message);
    assert.deepEqual([size(job.result.file).w, size(job.result.file).h], [1080, 1920]);
    assert.ok(existsSync(job.result.file.replace(/-short\.mp4$/, '-thumb.jpg')));
  } finally { server.kill(); }
  await new Promise((r) => setTimeout(r, 300));
  done();
});

test('the night script cannot reach the posting code', () => {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const m of readFileSync(file, 'utf8').matchAll(/from '(\.[^']+)'/g)) walk(join(file, '..', m[1]));
  };
  walk(join(CUTTER, 'night.mjs'));
  const names = [...seen].map((f) => f.split(/[\\/]/).pop());
  assert.ok(names.includes('night.mjs') && names.includes('pipeline.mjs'));
  assert.ok(!names.includes('social.mjs'), 'night.mjs imports social.mjs');
  const src = readFileSync(join(CUTTER, 'lib', 'night.mjs'), 'utf8');
  assert.doesNotMatch(src, /markPosted/);
});

test('the guard refuses Buffer, R2 and writes, and allows reads and the OpenDota parse request', async () => {
  const real = globalThis.fetch;
  const passed = [];
  globalThis.fetch = async (u) => { passed.push(String(u)); return new Response('{}'); };
  guardNetwork();
  await assert.rejects(fetch('https://api.buffer.com', { method: 'POST', body: '{}' }), /refused/);
  await assert.rejects(fetch('https://api.buffer.com/x'), /refused/);
  await assert.rejects(fetch('https://abc.r2.cloudflarestorage.com/bucket/key'), /refused/);
  await assert.rejects(fetch('https://secretshopdota.co.uk/api/clips/1/posted', { method: 'POST' }), /refused/);
  await assert.rejects(fetch('https://api.opendota.com/api/other', { method: 'POST' }), /refused/);
  await fetch('https://api.opendota.com/api/request/1', { method: 'POST' });
  await fetch('https://secretshopdota.co.uk/api/clips?status=approved');
  assert.equal(passed.length, 2);
  globalThis.fetch = real;
});

test('series are merged: retries first, finished ones dropped, a later link fills a gap', () => {
  const state = { series: {
    1000001: { status: 'done' }, 1000002: { status: 'retry', item: { title: 'R', matchIds: ['1000002'], vod: '' } }, 1000003: { status: 'gave-up' },
  } };
  const got = mergeSeries(state, [{ title: 'Hand', matchIds: ['1000004'], vod: 'x' }, { title: 'Bad', matchIds: ['abc'] }], [
    { title: 'Done', matchIds: ['1000001'] }, { title: 'Sheet', matchIds: ['1000002'], vod: 'http://v' }, { title: 'Old', matchIds: ['1000003'] }, { title: 'Dup', matchIds: ['1000004'] },
  ]);
  assert.deepEqual(got.map((s) => [s.title, s.vod]), [['R', 'http://v'], ['Hand', 'x']]);
});

test('schedule: games grouped by night and pair, the sheet supplies title and VOD', () => {
  const csv = 'Division,Date of Game,Team 1 Name,Team 2 Name,Format,Caster Name,Stream Link\n'
    + 'Upper,02-11-2026,Catwice,"Farm, ville",Bo3,Dan,https://www.twitch.tv/videos/555\n'
    + 'Lower,02-11-2026,A Team,B Team,Bo1,,\n'
    + 'Middle,02-11-2026,C Team,D Team,Bo3,Eve,https://twitch.tv/somechannel\n';
  const cache = { x: { matches: [
    { match_id: 2, timestamp: '2026-11-02T21:00:00Z', teams: [{ team_name: 'Farm, ville' }, { team_name: 'CATWICE' }] },
    { match_id: 1, timestamp: '2026-11-02T20:00:00Z', teams: [{ team_name: 'catwice' }, { team_name: 'Farm, ville' }] },
    { match_id: 1, timestamp: '2026-11-02T20:00:00Z', teams: [{ team_name: 'catwice' }, { team_name: 'Farm, ville' }] },
    { match_id: 3, timestamp: '2026-11-02T20:00:00Z', teams: [{ team_name: 'A Team' }, { team_name: 'B Team' }] },
    { match_id: 4, timestamp: '2026-11-02T20:00:00Z', teams: [{ team_name: 'C Team' }, { team_name: 'D Team' }] },
    { match_id: 9, timestamp: '2026-11-01T20:00:00Z', teams: [{ team_name: 'Other' }, { team_name: 'Night' }] },
  ] } };
  const s = seriesForDate(cache, sheetRows(csv), '2026-11-02');
  assert.deepEqual(s.map((x) => x.title), ['Catwice vs Farm, ville - Upper Div', 'A Team vs B Team - Lower Div', 'C Team vs D Team - Mid Div']);
  assert.deepEqual(s[0].matchIds, ['1', '2']);
  assert.equal(s[0].vod, 'https://www.twitch.tv/videos/555');
  assert.equal(s[1].notCast, true);
  assert.equal(s[2].vod, '', 'a channel link is not a VOD');
  assert.equal(isVideoLink('https://www.youtube.com/watch?v=abc'), true);
  assert.equal(isVideoLink('https://evil.example/twitch.tv/videos/1'), false);
  assert.deepEqual(parseCSV('a,"b ""q"" c"\r\n\r\n1,2'), [['a', 'b "q" c'], ['1', '2']]);
});

test('nightOf is the evening before a 02:00 run, in UK time', () => {
  assert.equal(nightOf(new Date('2026-11-03T02:00:00Z')), '2026-11-02');
  assert.equal(nightOf(new Date('2026-07-01T01:30:00Z')), '2026-06-30'); // 02:30 BST
});

test('Shorts with the same label get their own files, and still find their moment', () => {
  const m = (id) => ({ id, label: 'Teamfight to Catwice 3–1' });
  const p = { title: 'X vs Y', games: [{ moments: [m('m1'), m('m7')] }] };
  const [a, b] = p.games[0].moments;
  assert.equal(shortName(p, 0, a), 'x-vs-y-g1-teamfight-to-catwice-3-1');
  assert.equal(shortName(p, 0, b), 'x-vs-y-g1-teamfight-to-catwice-3-1-2');
  assert.equal(findMoment(p, `${shortName(p, 0, b)}.mp4`).m.id, 'm7');
});

test('hostile text: clip copy stays one title line, a long one is cut', () => {
  const c = clipCopy({ description: `${'z'.repeat(200)}\nsecond line`, teams: ['A', 'B'], submitter_name: 'Bo' });
  assert.ok(c.title.length <= 100);
  assert.doesNotMatch(c.title, /second line/);
  assert.match(clipCopy({ teams: [], description: '' }).title, /^Community clip/);
});

test('report keeps one line per item whatever the names contain', () => {
  const t = reportText({ date: 'd', notes: [], clips: [], series: [{ title: 'a\n# fake | heading', status: 'failed', reason: 'x\ny', shorts: [] }] });
  assert.ok(t.split('\n').some((l) => l.startsWith('## a # fake | heading: failed')));
});

test('banner text matches the page, crests resolve across spellings', async () => {
  assert.equal(fill('{league} · GAME {game}', { league: 'L' }), 'L');
  assert.equal(fill('{teamA}  vs  {teamB}', { teamA: 'A', teamB: 'B' }), 'A  vs  B');
  assert.match(await findCrest('Crêpe stack'), /Crepe_stack\.png$/);
  assert.match(await findCrest('the dark side of the map'), /TheDarkSideoftheMap\.png$/);
  assert.equal(await findCrest('No Such Team'), null);
});

test('overlay text with filter characters is drawn literally, not parsed', { timeout: 60000 }, async () => {
  const { dir, done } = tempData();
  const video = sampleVideo(join(dir, 'in', 'vod.mp4'), { seconds: 50, size: '320x180' });
  const match = sampleMatch(9000008);
  match.radiant_name = "Bo'bby:[a];%{pts},\\drop"; match.dire_name = 'x=y';
  seedMatch(dir, match);
  seedScan(dir, video);
  writeQueue(dir, [{ title: 'Hostile', vod: video, matchIds: ['9000008'] }]);
  const r = await runNightCli(dir, ['--date', '2026-11-02', '--no-schedule', '--no-inbox']);
  assert.equal(r.code, 0, r.err);
  assert.equal(nightFile(dir, '2026-11-02').series[0].status, 'done', JSON.stringify(nightFile(dir, '2026-11-02').series[0]));
  done();
});

test('schedule: a game after midnight stays with its evening, and near-miss team names still match the sheet', () => {
  const csv = 'Division,Date of Game,Team 1 Name,Team 2 Name,Format,Caster Name,Stream Link\n'
    + 'Upper,02-11-2026,Herald Royale,Catwice,Bo3,Dan,https://www.twitch.tv/videos/777\n';
  const cache = { x: { matches: [
    { match_id: 1, timestamp: '2026-11-02T20:00:00Z', teams: [{ team_name: 'Herald Royale with Cheese' }, { team_name: 'Catwice' }] },
    { match_id: 2, timestamp: '2026-11-02T22:00:00Z', teams: [{ team_name: 'Herald Royale with Cheese' }, { team_name: 'Catwice' }] },
    { match_id: 3, timestamp: '2026-11-03T00:20:00Z', teams: [{ team_name: 'Herald Royale with Cheese' }, { team_name: 'Catwice' }] },
  ] } };
  const [s, ...rest] = seriesForDate(cache, sheetRows(csv), '2026-11-02');
  assert.equal(rest.length, 0);
  assert.deepEqual(s.matchIds, ['1', '2', '3']);
  assert.equal(s.vod, 'https://www.twitch.tv/videos/777');
  assert.equal(s.division, 'upper');
  assert.deepEqual(seriesForDate(cache, sheetRows(csv), '2026-11-03'), []);
});

test('night.mjs refuses a stray word instead of running a real night', () => {
  const r = spawnSync(process.execPath, [join(CUTTER, 'night.mjs'), 'dry-run'], { encoding: 'utf8', env: { ...process.env, HC_DATA: tempData().dir } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Bad arguments: dry-run/);
});

test('the lock: of several runs starting together exactly one gets it, and a stale one is cleared', { timeout: 60000 }, async () => {
  const { dir, done } = tempData();
  const child = `const { lock } = await import(${JSON.stringify(new URL('../lib/night.mjs', import.meta.url).href)});
    try { const un = await lock(); console.log('won'); await new Promise((r) => setTimeout(r, 1500)); await un(); } catch (e) { console.log(e.code || e.message); }`;
  const run = () => new Promise((ok) => {
    let out = '';
    const p = spawn(process.execPath, ['--input-type=module', '-e', child], { env: { ...process.env, HC_DATA: dir }, windowsHide: true });
    p.stdout.on('data', (d) => { out += d; }); p.on('close', () => ok(out.trim()));
  });
  const results = await Promise.all(Array.from({ length: 6 }, run));
  assert.equal(results.filter((x) => x === 'won').length, 1, results.join(','));
  assert.equal(results.filter((x) => x === 'LOCKED').length, 5, results.join(','));
  assert.equal(existsSync(join(dir, 'night', 'lock')), false, 'the winner leaves no lock behind');
  writeFileSync(join(dir, 'night', 'lock'), '999999');
  assert.deepEqual(await Promise.all([run()]), ['won']);
  done();
});

test('a clip download over the cap, or cut short, leaves nothing behind', { timeout: 120000 }, async () => {
  const { MEDIA } = await import('../lib/util.mjs');
  const { fetchClip } = await import('../lib/inbox.mjs');
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'video/mp4' }); // no content-length: chunked
    const chunk = Buffer.alloc(1 << 20);
    if (req.url === '/big') { let n = 0; const send = () => { while (n < 62) { n++; if (!res.write(chunk)) return res.once('drain', send); } res.end(); }; send(); }
    else { res.write(chunk); setTimeout(() => res.destroy(), 50); }
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const url = (p) => `http://127.0.0.1:${srv.address().port}${p}`;
  try {
    await assert.rejects(fetchClip({ id: 901, file_path: 'a.mp4', file_url: url('/big') }), /bigger than the queue allows/);
    await assert.rejects(fetchClip({ id: 902, file_path: 'a.mp4', file_url: url('/cut') }));
    const left = existsSync(MEDIA) ? readdirSync(MEDIA).filter((f) => /^clip-90[12]/.test(f)) : [];
    assert.deepEqual(left, []);
  } finally { srv.close(); }
});
