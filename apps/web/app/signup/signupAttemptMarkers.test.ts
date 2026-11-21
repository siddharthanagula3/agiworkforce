import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type LegalConstantsModule = typeof import('@/lib/legal-constants');

vi.mock('@/lib/legal-constants', async (importOriginal) => {
  const actual = await importOriginal<LegalConstantsModule>();
  return {
    ...actual,
    POLICY_LAST_UPDATED: {
      ...actual.POLICY_LAST_UPDATED,
      terms: '2026-01-02',
      privacy: '2026-03-04',
    },
  };
});

import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import {
  AGE_CHECK_STORAGE_KEY,
  MARKETING_EMAIL_ATTEMPT_STORAGE_KEY,
  MARKETING_EMAIL_CHOICE_STORAGE_KEY,
  TERMS_GATE_STORAGE_KEY,
  clearSignupAttemptMarkers,
  hasCurrentTermsGateMarker,
  writeSignupAttemptMarkers,
} from './signupAttemptMarkers';

const EARLIER_ATTEMPT_KEYS = [
  MARKETING_EMAIL_CHOICE_STORAGE_KEY,
  MARKETING_EMAIL_ATTEMPT_STORAGE_KEY,
  AGE_CHECK_STORAGE_KEY,
] as const;

function leaveEarlierAttemptKeys(): void {
  window.localStorage.setItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY, POLICY_LAST_UPDATED.privacy);
  window.localStorage.setItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY, 'earlier-attempt');
  window.sessionStorage.setItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY, 'earlier-attempt');
  window.localStorage.setItem(AGE_CHECK_STORAGE_KEY, '18');
}

function nothingLeftFromEarlierAttempts(): void {
  for (const key of EARLIER_ATTEMPT_KEYS) expect(window.localStorage.getItem(key)).toBeNull();
  expect(window.sessionStorage.getItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY)).toBeNull();
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the marker of one sign-up attempt', () => {
  it('records the terms version that was on screen when the attempt started', () => {
    writeSignupAttemptMarkers();

    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.terms);
    expect(hasCurrentTermsGateMarker()).toBe(true);
  });

  it('writes nothing but the terms marker: no age and no marketing email choice', () => {
    writeSignupAttemptMarkers();

    expect(Object.keys(window.localStorage)).toEqual([TERMS_GATE_STORAGE_KEY]);
    expect(Object.keys(window.sessionStorage)).toEqual([]);
  });

  it('removes what an earlier sign-up screen left, whether the attempt starts or ends', () => {
    leaveEarlierAttemptKeys();
    writeSignupAttemptMarkers();
    nothingLeftFromEarlierAttempts();

    leaveEarlierAttemptKeys();
    clearSignupAttemptMarkers();
    nothingLeftFromEarlierAttempts();
    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBeNull();
  });

  it('reads a marker written against earlier terms as no marker', () => {
    window.localStorage.setItem(TERMS_GATE_STORAGE_KEY, '2025-12-31');

    expect(hasCurrentTermsGateMarker()).toBe(false);
  });

  it('keeps the two policy dates apart, so the privacy date cannot stand in for the terms', () => {
    window.localStorage.setItem(TERMS_GATE_STORAGE_KEY, POLICY_LAST_UPDATED.privacy);

    expect(hasCurrentTermsGateMarker()).toBe(false);
  });

  it('reads no marker, and throws nothing, when the browser refuses storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(() => writeSignupAttemptMarkers()).not.toThrow();
    expect(() => clearSignupAttemptMarkers()).not.toThrow();
    expect(hasCurrentTermsGateMarker()).toBe(false);
  });
});
