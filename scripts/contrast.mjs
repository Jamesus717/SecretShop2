// Measures WCAG contrast for the token pairs actually used. Run: node scripts/contrast.mjs
const lum = (hex) => {
  const c = hex.replace('#', '').match(/../g).map((h) => parseInt(h, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const themes = {
  dark: { bg: '#0b0f1a', surface: '#131a2b', text: '#eef1f8', dim: '#b4bdd0', muted: '#8f9bb3', gold: '#e8b84a', goldInk: '#1a1405', link: '#9db4ff' },
  light: { bg: '#eceff5', surface: '#ffffff', text: '#0e1424', dim: '#343d56', muted: '#4f5a74', gold: '#7a5600', goldInk: '#1a1405', link: '#1f45b8' },
};
let fail = 0;
for (const [name, t] of Object.entries(themes)) {
  const pairs = [
    ['text/bg', t.text, t.bg], ['dim/bg', t.dim, t.bg], ['muted/bg', t.muted, t.bg], ['muted/surface', t.muted, t.surface],
    ['dim/surface', t.dim, t.surface], ['gold-text/bg', t.gold, t.bg], ['gold-text/surface', t.gold, t.surface], ['link/bg', t.link, t.bg],
  ];
  for (const [label, a, b] of pairs) { const r = ratio(a, b); const ok = r >= 4.5; if (!ok) fail++; console.log(name.padEnd(5), label.padEnd(18), r.toFixed(2), ok ? 'AA' : 'FAIL'); }
}
// Fixed ink on division/gold fills (both themes)
for (const [l, bg] of [['upper', '#e8b84a'], ['mid', '#2dd4bf'], ['lower', '#ef4444']]) {
  const r = ratio('#0b0f1a', bg); const ok = r >= 4.5; if (!ok) fail++; console.log('tag  ', l.padEnd(18), r.toFixed(2), ok ? 'AA' : 'FAIL');
}
{ const r = ratio('#1a1405', '#e8b84a'); console.log('btn   gold-ink/gold    ', r.toFixed(2)); }
process.exit(fail ? 1 : 0);
