// yt-dlp download into the media folder. Used by the Download button and the night script.

import { spawn } from 'node:child_process';
import { join, isAbsolute } from 'node:path';
import { MEDIA, YTDLP } from './util.mjs';

export function download(url, update) {
  return new Promise((ok, bad) => {
    // Twitch: 1080p60 when there is one. Names are stable (site-id), so downloading
    // the same VOD again after a failure resumes rather than starting over.
    const tpl = join(MEDIA, '%(extractor_key)s-%(id)s.%(ext)s');
    // --print makes yt-dlp quiet, which also hides its progress, so ask for it back
    // in a fixed format. It can arrive on either stream.
    const args = ['-f', 'bv*[height<=1080]+ba/b[height<=1080]/b', '-N', '8', '--newline', '--merge-output-format', 'mp4',
      '--progress', '--progress-template', 'download:HCPROG %(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
      '--print', 'after_move:filepath', '--no-playlist', '-o', tpl, '--', url];
    const p = spawn(YTDLP, args, { windowsHide: true });
    let file = '', err = '';
    update(0, 'Starting… (Twitch can take a minute to begin)');
    const onLine = (l) => {
      const m = /HCPROG\s*([\d.]+)%\|\s*([^|]*)\|\s*(\S+)/.exec(l);
      if (m) update(+m[1] / 100, `Downloading ${m[1]}%${/\d/.test(m[2]) ? ` at ${m[2].trim()}` : ''}${/\d/.test(m[3]) ? `, ${m[3]} left` : ''}`);
      else if (isAbsolute(l.trim())) file = l.trim();
    };
    // Chunks don't end on line breaks, so keep the unfinished tail for the next one.
    const lines = (stream, also) => {
      let rest = '';
      stream.on('data', (d) => {
        const parts = (rest + d).split(/\r?\n|\r/);
        rest = parts.pop();
        parts.forEach((l) => { onLine(l); also?.(l); });
      });
      stream.on('end', () => rest && onLine(rest));
    };
    lines(p.stdout);
    lines(p.stderr, (l) => { if (!l.includes('HCPROG')) err = `${err}${l}\n`.slice(-1500); });
    p.on('error', (e) => bad(new Error(`Couldn't start yt-dlp (${e.message}). Install it with: winget install yt-dlp.yt-dlp`)));
    p.on('close', (c, sig) => (c || sig ? bad(new Error(`yt-dlp failed: ${err.slice(-400)}`)) : ok({ file })));
  });
}
