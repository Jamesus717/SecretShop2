import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_KEY, closeConsentSettings, getConsent, hasOptionalConsent, isConsentPanelOpen, openConsentSettings, resetConsentForTests, setConsent } from './consent';

function fakeStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

describe('consent', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
    resetConsentForTests();
  });

  it('is null before a choice', () => {
    expect(getConsent()).toBeNull();
    expect(hasOptionalConsent()).toBe(false);
  });

  it('stores and returns the choice', () => {
    setConsent('all');
    expect(getConsent()).toBe('all');
    expect(hasOptionalConsent()).toBe(true);
    expect(localStorage.getItem(CONSENT_KEY)).toBe('all');
  });

  it('essential does not allow optional embeds', () => {
    setConsent('essential');
    expect(hasOptionalConsent()).toBe(false);
  });

  it('reads a stored choice and ignores junk', () => {
    localStorage.setItem(CONSENT_KEY, 'essential');
    resetConsentForTests();
    expect(getConsent()).toBe('essential');
    localStorage.setItem(CONSENT_KEY, 'banana');
    resetConsentForTests();
    expect(getConsent()).toBeNull();
  });

  it('keeps working when storage throws', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } });
    resetConsentForTests();
    expect(getConsent()).toBeNull();
    setConsent('all');
    expect(getConsent()).toBe('all');
  });

  it('reopens and closes the settings panel; choosing closes it', () => {
    openConsentSettings();
    expect(isConsentPanelOpen()).toBe(true);
    closeConsentSettings();
    expect(isConsentPanelOpen()).toBe(false);
    openConsentSettings();
    setConsent('essential');
    expect(isConsentPanelOpen()).toBe(false);
  });
});
