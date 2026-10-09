// Posting to TikTok / Instagram / YouTube Shorts through Buffer (X is done by hand).
//
// Buffer's API (GraphQL, api.buffer.com) has no upload endpoint: every image or
// video has to be at a public https URL that stays up until the post goes out.
// So each file is first copied to an S3-compatible bucket (Cloudflare R2), then
// Buffer is given its public URL. Settings live in D:\Videos\SecretShop\config.json:
//
//   { "buffer":  { "apiKey": "…" },
//     "storage": { "endpoint": "https://<account id>.r2.cloudflarestorage.com", "bucket": "secretshop-social",
//                  "accessKeyId": "…", "secretAccessKey": "…", "publicUrl": "https://pub-….r2.dev" } }
//
// Sounds: the API can't attach one on any platform (checked against the schema,
// Oct 2026). A photo either goes out as a "reminder" post (Buffer pings your phone
// at the time, you post it from the TikTok/Instagram app and pick a sound there),
// or is turned into a short video here with a track from the music folder.

import { createReadStream } from 'node:fs';
import { stat, readdir, mkdir } from 'node:fs/promises';
import { createHash, createHmac } from 'node:crypto';
import https from 'node:https';
import { join, basename, extname } from 'node:path';
import { DATA, CACHE, POSTING, MUSIC, FFMPEG, enc, run, readJSON, writeJSON } from './util.mjs';

const API = 'https://api.buffer.com';
export const SERVICES = ['tiktok', 'instagram', 'youtube'];
export const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
export const VIDEO_EXT = /\.(mp4|mov)$/i;
export const AUDIO_EXT = /\.(mp3|m4a|wav|ogg)$/i;

const config = () => readJSON(join(DATA, 'config.json'), {});

// --- Buffer -----------------------------------------------------------------

async function gql(query, variables = {}) {
  const key = process.env.BUFFER_API_KEY || (await config()).buffer?.apiKey;
  if (!key) throw new Error('No Buffer API key: add "buffer": { "apiKey": "…" } to config.json in the data folder (see README)');
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(`Buffer said ${res.status}${data?.errors ? `: ${data.errors.map((e) => e.message).join('; ')}` : ''}`);
  if (data.errors?.length) throw new Error(`Buffer: ${data.errors.map((e) => e.message).join('; ')}`);
  return data.data;
}

let org = null;
async function organization() {
  if (org) return org;
  const { account } = await gql('{ account { organizations { id name } } }');
  const want = (await config()).buffer?.organizationId;
  org = account.organizations.find((o) => o.id === want) || account.organizations[0];
  if (!org) throw new Error('This Buffer account has no organisation');
  return org;
}

export async function channels() {
  const o = await organization();
  const { channels: list } = await gql(
    'query($input: ChannelsInput!) { channels(input: $input) { id name displayName service avatar isDisconnected isQueuePaused } }',
    { input: { organizationId: o.id } });
  return { organization: o.name, channels: list.filter((c) => SERVICES.includes(c.service)) };
}

// What's queued and what went out in the last fortnight, newest first.
export async function posts() {
  const o = await organization();
  const { channels: list } = await channels();
  if (!list.length) return [];
  const start = new Date(Date.now() - 14 * 864e5).toISOString();
  const { posts: res } = await gql(`query($input: PostsInput!) { posts(first: 100, input: $input) { edges { node {
      id text status dueAt sentAt channelId channelService externalLink schedulingType
      error { message } assets { type source thumbnail } } } } }`,
    { input: { organizationId: o.id, filter: { channelIds: list.map((c) => c.id), dueAt: { start } }, sort: [{ field: 'dueAt', direction: 'desc' }] } });
  return (res.edges || []).map((e) => e.node);
}

export async function deletePost(id) {
  const { deletePost: r } = await gql('mutation($input: DeletePostInput!) { deletePost(input: $input) { ... on DeletePostSuccess { id } ... on MutationError { message } } }', { input: { id } });
  if (r.message) throw new Error(r.message);
  return r;
}

async function createPost(input) {
  const { createPost: r } = await gql(`mutation($input: CreatePostInput!) { createPost(input: $input) {
      ... on PostActionSuccess { post { id status dueAt } } ... on MutationError { message } } }`, { input });
  if (r.message) throw new Error(r.message);
  return r.post;
}

// --- hosting (S3-compatible PUT, AWS signature v4) ----------------------------------

const sha = (s) => createHash('sha256').update(s).digest('hex');
const hmac = (k, s) => createHmac('sha256', k).update(s).digest();
const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mov': 'video/quicktime' };

// Exported for checking against AWS's own signer.
export function signPut(s, key, now = new Date().toISOString().replace(/[-:]|\.\d+/g, '')) { // 20261009T101500Z
  const url = new URL(`${s.endpoint.replace(/\/$/, '')}/${s.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`);
  const day = now.slice(0, 8), region = s.region || 'auto';
  const scope = `${day}/${region}/s3/aws4_request`;
  const headers = { host: url.host, 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD', 'x-amz-date': now };
  const signed = Object.keys(headers).sort();
  const canonHeaders = signed.map((h) => `${h}:${headers[h]}\n`).join('');
  const canonical = ['PUT', url.pathname, '', canonHeaders, signed.join(';'), 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', now, scope, sha(canonical)].join('\n');
  const kSign = ['s3', 'aws4_request'].reduce(hmac, hmac(hmac(`AWS4${s.secretAccessKey}`, day), region));
  const sig = createHmac('sha256', kSign).update(toSign).digest('hex');
  return { url, headers: { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${s.accessKeyId}/${scope}, SignedHeaders=${signed.join(';')}, Signature=${sig}` } };
}

function put(s, key, file, size, type) {
  const { url, headers } = signPut(s, key);
  return new Promise((ok, bad) => {
    const req = https.request(url, { method: 'PUT', headers: { ...headers, 'content-type': type, 'content-length': size } }, (res) => {
      let body = ''; res.on('data', (d) => { body += d; });
      res.on('end', () => (res.statusCode === 200 ? ok() : bad(new Error(`Storage upload failed (${res.statusCode}): ${body.slice(0, 300)}`))));
    });
    req.on('error', bad);
    createReadStream(file).pipe(req);
  });
}

// Local file → public URL. Remembered by name+size+date so nothing is uploaded twice.
async function host(file) {
  const s = (await config()).storage;
  if (!s?.endpoint || !s.bucket || !s.accessKeyId || !s.secretAccessKey || !s.publicUrl) {
    throw new Error('Media hosting isn\'t set up: Buffer needs every file at a public link. Add "storage" to config.json (see README)');
  }
  const st = await stat(file);
  const memo = join(CACHE, 'hosted.json');
  const seen = await readJSON(memo, {});
  const id = `${file}|${st.size}|${st.mtimeMs}`;
  if (seen[id]) return seen[id];
  const ext = extname(file).toLowerCase();
  const slug = basename(file, extname(file)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const key = `social/${new Date().toISOString().slice(0, 7)}/${slug}-${sha(id).slice(0, 8)}${ext}`;
  await put(s, key, file, st.size, TYPES[ext] || 'application/octet-stream');
  const url = `${s.publicUrl.replace(/\/$/, '')}/${key}`;
  seen[id] = url;
  await writeJSON(memo, seen);
  return url;
}

// --- media ------------------------------------------------------------------

export async function music() {
  await mkdir(MUSIC, { recursive: true });
  return (await readdir(MUSIC)).filter((f) => AUDIO_EXT.test(f)).sort();
}

// Photos → a 9:16 video: each photo over a blurred copy of itself, a slow push-in,
// and a music track (or silence). Used for YouTube, which only takes video, and
// whenever a photo post should go out with our own sound.
export async function photoVideo({ images, track, seconds = 10, out }) {
  const each = Math.max(2, seconds / images.length);
  const frames = Math.round(each * 60);
  const args = ['-y', '-hide_banner', '-v', 'error'];
  for (const img of images) args.push('-loop', '1', '-framerate', '60', '-t', each.toFixed(2), '-i', img);
  if (track) args.push('-stream_loop', '-1', '-i', join(MUSIC, basename(track)));
  else args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
  const a = images.length;
  const graph = images.map((_, i) => [
    `[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:3,eq=brightness=-0.2[bg${i}]`,
    `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg${i}]`,
    `[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2,scale=1620:2880,zoompan=z='1+0.06*on/${frames}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1080x1920:fps=60,setsar=1,format=yuv420p[v${i}]`,
  ].join(';')).join(';')
    + `;${images.map((_, i) => `[v${i}]`).join('')}concat=n=${a}:v=1:a=0,fade=t=in:st=0:d=0.3,fade=t=out:st=${(each * a - 0.5).toFixed(2)}:d=0.5[v]`
    + `;[${a}:a]atrim=0:${(each * a).toFixed(2)},afade=t=out:st=${(each * a - 1.5).toFixed(2)}:d=1.5,aresample=48000[a]`;
  args.push('-filter_complex', graph, '-map', '[v]', '-map', '[a]', '-t', (each * a).toFixed(2),
    ...enc.video, '-r', '60', '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-movflags', '+faststart', out);
  await run(FFMPEG, args);
  return out;
}

async function asJpeg(img) {
  if (/\.jpe?g$/i.test(img)) return img;
  await mkdir(join(POSTING, 'made'), { recursive: true });
  const out = join(POSTING, 'made', `${basename(img, extname(img))}.jpg`);
  await run(FFMPEG, ['-y', '-hide_banner', '-v', 'error', '-i', img, '-vf', 'format=yuvj444p', '-q:v', '2', out]);
  return out;
}

// --- one post to several platforms -----------------------------------------------------
// opts: { files, caption, title, channelIds, when: { mode: 'queue'|'now'|'at', at }, sound: 'app'|'track'|'none', track, seconds, soundNote }

export async function publish(opts, update) {
  const { files, caption = '', title = '', channelIds = [], when = { mode: 'queue' }, sound = 'app', track, seconds = 10, soundNote = '', coverMs = 0 } = opts;
  if (!files?.length) throw new Error('Add a photo or video first');
  if (!channelIds.length) throw new Error('Tick at least one platform');
  const images = files.filter((f) => IMAGE_EXT.test(f));
  const videos = files.filter((f) => VIDEO_EXT.test(f));
  if (videos.length && (videos.length > 1 || images.length)) throw new Error('A post is either one video or some photos, not a mix');
  if (images.length > 10) throw new Error('Ten photos at most');

  const { channels: all } = await channels();
  const targets = channelIds.map((id) => all.find((c) => c.id === id)).filter(Boolean);
  if (!targets.length) throw new Error('None of those channels are connected in Buffer any more');

  // Photos need a video for YouTube, and for everyone when they should carry our own track.
  let video = videos[0] || null;
  const needVideo = images.length && (sound === 'track' || targets.some((c) => c.service === 'youtube'));
  if (needVideo) {
    update(0.05, 'Making a video from the photos…');
    await mkdir(join(POSTING, 'made'), { recursive: true });
    video = await photoVideo({ images, track: sound === 'track' ? track : null, seconds, out: join(POSTING, 'made', `photos-${Date.now()}.mp4`) });
  }

  update(0.3, 'Uploading to the media host…');
  const videoUrl = video ? await host(video) : null;
  // Instagram and TikTok only take JPEG photos through their APIs, and the Stat Designer exports PNG.
  const imageUrls = [];
  for (const img of images) imageUrls.push(await host(await asJpeg(img)));

  const base = {
    text: caption,
    mode: { queue: 'addToQueue', now: 'shareNow', at: 'customScheduled' }[when.mode] || 'addToQueue',
    ...(when.mode === 'at' ? { dueAt: new Date(when.at).toISOString() } : {}),
  };
  const results = [];
  for (const [i, c] of targets.entries()) {
    update(0.6 + (0.4 * i) / targets.length, `Sending to ${c.service}…`);
    // Photos go to TikTok/Instagram as photos unless they're getting our track.
    const asPhotos = images.length && !(sound === 'track') && c.service !== 'youtube';
    const input = {
      ...base,
      channelId: c.id,
      schedulingType: asPhotos && sound === 'app' ? 'notification' : 'automatic',
      assets: asPhotos ? imageUrls.map((url) => ({ image: { url } }))
        // The cover frame (TikTok/Instagram). Shorts rendered here open on their thumbnail, so 0 is that.
        : [{ video: { url: videoUrl, metadata: { thumbnailOffset: images.length ? 1000 : Math.max(0, Math.round(+coverMs || 0)) } } }],
      metadata: {},
    };
    if (c.service === 'instagram') {
      input.metadata.instagram = { type: asPhotos ? 'post' : 'reel', shouldShareToFeed: true,
        ...(asPhotos && soundNote ? { stickerFields: { music: soundNote } } : {}) };
    }
    if (c.service === 'tiktok' && title) input.metadata.tiktok = { title: title.slice(0, 90) };
    if (c.service === 'youtube') {
      input.metadata.youtube = { title: (title || caption.split('\n')[0] || 'SecretLeague').slice(0, 100), privacy: 'public', categoryId: '20', madeForKids: false, notifySubscribers: true };
    }
    try {
      const post = await createPost(input);
      results.push({ service: c.service, channel: c.displayName || c.name, ok: true, id: post.id, status: post.status, dueAt: post.dueAt, reminder: input.schedulingType === 'notification' });
    } catch (e) {
      results.push({ service: c.service, channel: c.displayName || c.name, ok: false, error: e.message });
    }
  }
  return { results, made: needVideo ? video : null };
}
