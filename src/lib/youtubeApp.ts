/**
 * On phones, open YouTube links in the YouTube app instead of the browser.
 * - Android: an intent:// URL opens the app, falling back to the web page if it isn't installed.
 * - iPhone/iPad: plain https youtube.com links are Universal Links, so iOS hands them to the app when installed;
 *   they must open in the same tab (target=_blank can stop iOS handing over), so `newTab` is false there.
 * - Desktop: unchanged, new tab.
 */
const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
const isAndroid = /Android/i.test(ua);
const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);

export function youtubeLink(url: string): { href: string; newTab: boolean } {
  if (isAndroid) {
    try {
      const u = new URL(url);
      const fallback = encodeURIComponent(u.href);
      return { href: `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.google.android.youtube;S.browser_fallback_url=${fallback};end`, newTab: false };
    } catch { /* fall through */ }
  }
  if (isIOS) return { href: url, newTab: false };
  return { href: url, newTab: true };
}

/** Props for an <a> pointing at YouTube. */
export function youtubeAnchor(url: string) {
  const { href, newTab } = youtubeLink(url);
  return newTab ? { href, target: '_blank', rel: 'noopener noreferrer' } : { href };
}
