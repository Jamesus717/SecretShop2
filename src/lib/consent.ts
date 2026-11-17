import { useSyncExternalStore } from 'react';

/**
 * Cookie / storage consent. The choice is stored in localStorage (strictly necessary: it only remembers the choice).
 * 'essential' = only what the site needs to work. 'all' = also optional third-party embeds (e.g. YouTube video).
 * null = not chosen yet.
 */
export type Consent = 'essential' | 'all';

export const CONSENT_KEY = 'sl_consent_v1';

type Listener = () => void;
const listeners = new Set<Listener>();
let panelOpen = false;
let memory: Consent | null | undefined; // undefined = not read yet

function read(): Consent | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'essential' || v === 'all' ? v : null;
  } catch {
    return null;
  }
}

function emit() { listeners.forEach((l) => l()); }

/** Current choice, or null if the visitor has not chosen. */
export function getConsent(): Consent | null {
  if (memory === undefined) memory = read();
  return memory;
}

export function setConsent(c: Consent): void {
  memory = c;
  try { localStorage.setItem(CONSENT_KEY, c); } catch { /* private mode: the choice lasts this page view */ }
  panelOpen = false;
  emit();
}

/** True when optional third-party embeds may load. */
export function hasOptionalConsent(): boolean {
  return getConsent() === 'all';
}

/** Footer link: show the banner again so the choice can be changed. */
export function openConsentSettings(): void { panelOpen = true; emit(); }
export function closeConsentSettings(): void { panelOpen = false; emit(); }
export function isConsentPanelOpen(): boolean { return panelOpen; }

/** Test helper: forget the in-memory copy. */
export function resetConsentForTests(): void { memory = undefined; panelOpen = false; emit(); }

function subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }

export function useConsent(): Consent | null {
  return useSyncExternalStore(subscribe, getConsent, () => null);
}

/** Banner is visible when no choice is stored, or the footer link reopened it. */
export function useConsentPanelVisible(): boolean {
  return useSyncExternalStore(subscribe, () => getConsent() === null || panelOpen, () => false);
}
