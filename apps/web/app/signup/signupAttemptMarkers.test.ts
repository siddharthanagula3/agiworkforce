import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import {
  PRODUCT_UPDATES_CHOICE_STORAGE_KEY,
  TERMS_GATE_STORAGE_KEY,
  clearSignupAttemptMarkers,
  hasCurrentTermsGateMarker,
  readCarriedProductUpdatesChoice,
  writeSignupAttemptMarkers,
} from './signupAttemptMarkers';

function stored(key: string): string | null {
  return window.localStorage.getItem(key);
}

describe('the markers of one sign-up attempt', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('carries a ticked choice with the privacy notice version that was on screen', () => {
    writeSignupAttemptMarkers({ productUpdates: true });

    expect(stored(TERMS_GATE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.terms);
    expect(stored(PRODUCT_UPDATES_CHOICE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.privacy);
    expect(hasCurrentTermsGateMarker()).toBe(true);
    expect(readCarriedProductUpdatesChoice()).toEqual({
      kind: 'current',
      noticeVersion: POLICY_LAST_UPDATED.privacy,
    });
  });

  it('removes a choice an earlier attempt left when this attempt did not tick the box', () => {
    writeSignupAttemptMarkers({ productUpdates: true });

    writeSignupAttemptMarkers({ productUpdates: false });

    expect(stored(TERMS_GATE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.terms);
    expect(stored(PRODUCT_UPDATES_CHOICE_STORAGE_KEY)).toBeNull();
    expect(readCarriedProductUpdatesChoice()).toEqual({ kind: 'none' });
  });

  it('clears both markers together', () => {
    writeSignupAttemptMarkers({ productUpdates: true });

    clearSignupAttemptMarkers();

    expect(stored(TERMS_GATE_STORAGE_KEY)).toBeNull();
    expect(stored(PRODUCT_UPDATES_CHOICE_STORAGE_KEY)).toBeNull();
    expect(hasCurrentTermsGateMarker()).toBe(false);
    expect(readCarriedProductUpdatesChoice()).toEqual({ kind: 'none' });
  });

  it('reads a choice made against an earlier notice as stale, never as a grant', () => {
    window.localStorage.setItem(PRODUCT_UPDATES_CHOICE_STORAGE_KEY, '1970-01-01');

    expect(readCarriedProductUpdatesChoice()).toEqual({ kind: 'stale' });
  });

  it('keeps the two versions apart, so neither policy date can stand in for the other', () => {
    expect(POLICY_LAST_UPDATED.terms).not.toBe(POLICY_LAST_UPDATED.privacy);
    window.localStorage.setItem(PRODUCT_UPDATES_CHOICE_STORAGE_KEY, POLICY_LAST_UPDATED.terms);
    window.localStorage.setItem(TERMS_GATE_STORAGE_KEY, POLICY_LAST_UPDATED.privacy);

    expect(readCarriedProductUpdatesChoice()).toEqual({ kind: 'stale' });
    expect(hasCurrentTermsGateMarker()).toBe(false);
  });

  it('carries no choice when the browser refuses storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    expect(() => writeSignupAttemptMarkers({ productUpdates: true })).not.toThrow();
    expect(() => clearSignupAttemptMarkers()).not.toThrow();
    expect(hasCurrentTermsGateMarker()).toBe(false);
    expect(readCarriedProductUpdatesChoice()).toEqual({ kind: 'none' });
  });

  it('writes no choice when the terms marker itself could not be written', () => {
    const setItem = Storage.prototype.setItem;
    const attempted: string[] = [];
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      attempted.push(key);
      if (key === TERMS_GATE_STORAGE_KEY) throw new DOMException('full', 'QuotaExceededError');
      setItem.call(this, key, value);
    });

    writeSignupAttemptMarkers({ productUpdates: true });

    expect(attempted).toEqual([TERMS_GATE_STORAGE_KEY]);
    expect(stored(PRODUCT_UPDATES_CHOICE_STORAGE_KEY)).toBeNull();
  });
});
