// node --test "tools/highlight-cutter/test/*.test.mjs"
// The sample night run (night.mjs --sample): its dry run on the mock match, the VOD
// cut and its size cap, and a whole run on a made-up sample.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tempData, sampleVideo, sampleMatch, seedMatch, seedScan, runNightCli } from './helpers.mjs';

process.env.HC_DATA ??= tempData().dir;
const { cutSample, readSample } = await import('../lib/sample.mjs');
const { probe } = await import('../lib/util.mjs');

const report = (data, name) => JSON.parse(readFileSync(join(data, 'night', `${name}.json`), 'utf8'));

test('the committed sample has a mock match for its dry run', async () => {
  const s = await readSample();
  assert.match(s.date, /^\d{4}-\d{2}-\d{2}$/);
  for (const id of s.matchIds) assert.ok(existsSync(join(import.meta.dirname, '..', '..', '..', 'mock-data', 'opendota', `${id}.json`)), id);
  assert.ok(s.section[1] - s.section[0] < 3600, 'a sample should be about one game');
});

test('sample dry run plans the Shorts from mock data, with no network and no renders', { timeout: 60000 }, async () => {
  const { dir, done } = tempData();
  const net = join(dir, 'net.log');
  const r = await runNightCli(dir, ['--sample', '--dry-run'], { HC_SAMPLE_DATA: dir, HC_NET_LOG: net });
  assert.equal(r.code, 0, r.err);
  const n = report(dir, `night-${(await readSample()).date}-dry`);
  const s = n.series[0];
  assert.equal(s.status, 'planned');
  assert.equal(s.wouldRender.length, 3, JSON.stringify(s));
  for (const x of s.wouldRender) { assert.match(x.title, /#Shorts$/); assert.match(x.file, /\.mp4$/); }
  assert.ok(s.wouldRender.some((x) => /GG/.test(x.moment)), 'the game-winning fight is one of them');
  assert.match(r.out, /3 Short\(s\) planned/);
  assert.equal(existsSync(net), false, 'dry run reached for the network');
  assert.equal(existsSync(join(dir, 'output')), false);
  assert.equal(existsSync(join(dir, 'night', 'state.json')), false);
  done();
});

test('a dry run with no cached match data says so instead of failing', { timeout: 60000 }, async () => {
  const { dir, done } = tempData();
  const sample = join(dir, 'sample.json');
  writeFileSync(sample, JSON.stringify({ date: '2026-11-02', title: 'A vs B', matchIds: ['9000077'], file: 's.mp4', section: [0, 10] }));
  const r = await runNightCli(dir, ['--sample', '--dry-run'], { HC_SAMPLE_DATA: dir, HC_SAMPLE: sample });
  assert.equal(r.code, 0, r.err);
  const s = report(dir, 'night-2026-11-02-dry').series[0];
  assert.equal(s.status, 'planned');
  assert.match(s.problems.join(), /No match data for game 1 \(9000077\)/);
  done();
});

test('cutSample keeps only the section, and refuses one over the cap', { timeout: 60000 }, async () => {
  const { dir, done } = tempData();
  const src = sampleVideo(join(dir, 'full.mp4'), { seconds: 60 });
  const { file, size } = await cutSample(src, join(dir, 'media', 'cut.mp4'), [20, 40]);
  const d = (await probe(file)).duration;
  assert.ok(d > 15 && d < 30, `cut is ${d}s`); // stream copy starts on the keyframe before 20s
  assert.ok(size < statSync(src).size);
  await assert.rejects(cutSample(src, join(dir, 'media', 'big.mp4'), [0, 60], { max: 50e3 }), /over/);
  assert.equal(existsSync(join(dir, 'media', 'big.mp4')), false);
  assert.equal(existsSync(join(dir, 'media', 'big.mp4.part.mp4')), false);
  await assert.rejects(cutSample(join(dir, 'nope.mp4'), join(dir, 'media', 'x.mp4'), [0, 5]), /doesn't exist/);
  done();
});

test('sample run: cut → scan → Shorts and a report in the sample folder, again on a second run', { timeout: 300000 }, async () => {
  const { dir, done } = tempData();
  const full = sampleVideo(join(dir, 'source', 'vod.mp4'), { seconds: 60 });
  const sample = join(dir, 'sample.json');
  writeFileSync(sample, JSON.stringify({ date: '2026-11-02', title: 'Crêpe stack vs Catwice - Upper Div', matchIds: ['9000071'], file: 's.mp4', section: [0, 55] }));
  seedMatch(dir, sampleMatch(9000071));
  const env = { HC_SAMPLE_DATA: dir, HC_SAMPLE: sample, HC_SAMPLE_SOURCE: full, HC_NET_LOG: join(dir, 'net.log') };
  // The clock reader can't read a test pattern, so cut first and stand in for its scan.
  await cutSample(full, join(dir, 'media', 's.mp4'), [0, 55]);
  seedScan(dir, join(dir, 'media', 's.mp4'));
  for (const round of [1, 2]) {
    const r = await runNightCli(dir, ['--sample'], env);
    assert.equal(r.code, 0, r.err);
    const s = report(dir, 'night-2026-11-02').series[0];
    assert.equal(s.status, 'done', `round ${round}: ${JSON.stringify(s)}`);
    assert.ok(s.shorts.length >= 1);
    for (const x of s.shorts) { assert.ok(x.ok, x.file); assert.ok(x.file.startsWith(dir), x.file); assert.equal(x.status, 'awaiting approval'); }
    assert.match(r.out, /Couldn't fetch match 9000071 .*using the cached copy/);
  }
  // The only call it tried was reading the match from OpenDota (refused by the test network).
  const calls = readFileSync(join(dir, 'net.log'), 'utf8').trim().split('\n');
  assert.ok(calls.every((c) => c === 'GET https://api.opendota.com/api/matches/9000071'), calls.join('\n'));
  done();
});

test('sample run with no source VOD stops with a clear message', { timeout: 60000 }, async () => {
  const { dir, done } = tempData();
  const sample = join(dir, 'sample.json');
  writeFileSync(sample, JSON.stringify({ date: '2026-11-02', title: 'A vs B', matchIds: ['9000072'], file: 's.mp4', section: [0, 10] }));
  seedMatch(dir, sampleMatch(9000072));
  const r = await runNightCli(dir, ['--sample'], { HC_SAMPLE_DATA: dir, HC_SAMPLE: sample, HC_SAMPLE_SOURCE: '' });
  assert.equal(r.code, 1);
  assert.match(r.err, /No sample VOD: set HC_SAMPLE_SOURCE/);
  done();
});
