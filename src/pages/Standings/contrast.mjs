// Contrast for the colours the Standings / Group Stage pages add. Run: node src/pages/Standings/contrast.mjs
const lum = (hex) => { const c = hex.replace('#', '').match(/../g).map((h) => parseInt(h, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (a, b, t) => '#' + [0, 2, 4].map((i) => Math.round(parseInt(a.slice(1 + i, 3 + i), 16) * t + parseInt(b.slice(1 + i, 3 + i), 16) * (1 - t)).toString(16).padStart(2, '0')).join('');
const T = {
  dark: { bg: '#0b0f1a', raise: '#0f1524', surface: '#131a2b', surface2: '#1a2338', text: '#eef1f8', dim: '#b4bdd0', muted: '#8f9bb3', gold: '#e8b84a', goldText: '#e8b84a', loss: '#c98a96', link: '#9db4ff' },
  light: { bg: '#eceff5', raise: '#e4e8f0', surface: '#ffffff', surface2: '#f4f6fa', text: '#0e1424', dim: '#343d56', muted: '#4f5a74', gold: '#e8b84a', goldText: '#7a5600', loss: '#8e4a58', link: '#1f45b8' },
};
let fail = 0;
const chk = (n, th, a, b) => { const r = ratio(a, b); const ok = r >= 4.5; if (!ok) fail++; console.log(th.padEnd(5), n.padEnd(34), r.toFixed(2), ok ? 'AA' : 'FAIL'); };
for (const [th, t] of Object.entries(T)) {
  const lead = mix(t.gold, t.surface, 0.10); // winner row tint
  const leadHover = mix(t.gold, t.surface2, 0.16);
  chk('loss on surface', th, t.loss, t.surface);
  chk('loss on lead row', th, t.loss, lead);
  chk('text on lead row', th, t.text, lead);
  chk('rank gold-text on lead row', th, t.goldText, lead);
  chk('rank gold-text on lead hover', th, t.goldText, leadHover);
  chk('winner team gold-text on bg', th, t.goldText, t.bg);
  chk('winner team gold-text on surface', th, t.goldText, t.surface);
  chk('muted on raise (th, notes)', th, t.muted, t.raise);
  chk('muted on surface', th, t.muted, t.surface);
  chk('dim on raise', th, t.dim, t.raise);
  chk('link on raise (roster names)', th, t.link, t.raise);
  chk('text on surface-2 hover', th, t.text, t.surface2);
  chk('muted on bg (match row loser)', th, t.muted, t.bg);
}
for (const [n, bg] of [['rating good', '#2dd4bf'], ['rating mid', '#c3cada'], ['rating bad', '#e5a1ab'], ['div label upper', '#e8b84a'], ['div label mid', '#2dd4bf'], ['div label lower', '#ef4444']]) {
  const r = ratio('#0b0f1a', bg); const ok = r >= 4.5; if (!ok) fail++; console.log('both '.padEnd(6), (n + ' (ink on fill)').padEnd(34), r.toFixed(2), ok ? 'AA' : 'FAIL');
}
process.exit(fail ? 1 : 0);
