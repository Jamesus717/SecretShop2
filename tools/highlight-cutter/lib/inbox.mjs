// The clip queue on the site, from the cutter's side: reads approved clips and
// fetches their videos (functions/api/clips/[[route]].js has the API). Reading
// changes nothing there, so a failed render never loses a clip.
//
// { "clips": { "site": "https://secretshopdota.co.uk", "token": "…" } } in config.json
// (or CLIPS_BOT_TOKEN in the environment).

import { join, extname } from 'node:path';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline as pipe } from 'node:stream/promises';
import { DATA, MEDIA, readJSON } from './util.mjs';
import { download } from './download.mjs';

const MAX_FILE = 60e6; // the site stops uploads at 50 MB

async function settings() {
  const c = (await readJSON(join(DATA, 'config.json'), {})).clips || {};
  return { site: (c.site || 'https://secretshopdota.co.uk').replace(/\/$/, ''), token: process.env.CLIPS_BOT_TOKEN || c.token || '' };
}

export async function approvedClips() {
  const { site, token } = await settings();
  if (!token) throw new Error('No clip queue token: add "clips": { "token": "…" } to config.json in the data folder');
  const res = await fetch(`${site}/api/clips?status=approved`, { headers: { authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(data?.clips)) throw new Error(`Clip queue said ${res.status}${data?.error ? `: ${data.error}` : ''}`);
  return data.clips;
}

// An uploaded clip comes with a signed file_url, a link with yt-dlp.
export async function fetchClip(clip, update = () => {}) {
  if (clip.file_url) {
    await mkdir(MEDIA, { recursive: true });
    const ext = /^\.(mp4|mov|webm)$/i.test(extname(clip.file_path || '')) ? extname(clip.file_path) : '.mp4';
    const file = join(MEDIA, `clip-${+clip.id}${ext}`);
    if (await stat(file).catch(() => null)) return file;
    const res = await fetch(clip.file_url);
    if (!res.ok) throw new Error(`Clip file said ${res.status}`);
    if (+res.headers.get('content-length') > MAX_FILE) throw new Error('Clip file is bigger than the queue allows');
    // Under another name until it's whole, so an interrupted download isn't reused tomorrow.
    const part = `${file}.part`;
    await pipe(Readable.fromWeb(res.body), createWriteStream(part)).catch(async (e) => { await rm(part, { force: true }); throw e; });
    // No content-length on a chunked reply, so check what actually arrived.
    if ((await stat(part)).size > MAX_FILE) { await rm(part, { force: true }); throw new Error('Clip file is bigger than the queue allows'); }
    await rename(part, file);
    return file;
  }
  if (!/^https:\/\//.test(clip.link || '')) throw new Error('Clip has no file and no https link');
  return (await download(clip.link, update)).file;
}

// Only ever run by hand, after a person has really posted the clip. Never by a night run.
export async function markPosted(id, postUrls) {
  const { site, token } = await settings();
  if (!token) throw new Error('No clip queue token: add "clips": { "token": "…" } to config.json in the data folder');
  const res = await fetch(`${site}/api/clips/${+id}/posted`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ post_urls: postUrls }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Clip queue said ${res.status}${data?.error ? `: ${data.error}` : ''}`);
  return data;
}
