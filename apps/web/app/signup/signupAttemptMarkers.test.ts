import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The terms and the privacy policy can be revised on the same day, and these
// tests need two dates that differ to tell the two markers apart.
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
  carriedChoiceMustBeAskedAgain,
  clearSignupAttemptMarkers,
  hasCurrentTermsGateMarker,
  readCarriedAgeCheck,
  readCarriedMarketingEmailChoice,
  writeSignupAttemptMarkers,
} from './signupAttemptMarkers';

function stored(key: string): string | null {
  return window.localStorage.getItem(key);
}

function heldByThisTab(key: string): string | null {
  return window.sessionStorage.getItem(key);
}

function openAnotherTab(): void {
  window.sessionStorage.clear();
}

describe('the markers of one sign-up attempt', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('carries a ticked choice with the privacy notice version that was on screen', () => {
    writeSignupAttemptMarkers({ marketingEmail: true, ageCheckedAgainst: null });

    expect(stored(TERMS_GATE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.terms);
    expect(stored(MARKETING_EMAIL_CHOICE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.privacy);
    expect(hasCurrentTermsGateMarker()).toBe(true);
    expect(readCarriedMarketingEmailChoice()).toEqual({
      kind: 'current',
      noticeVersion: POLICY_LAST_UPDATED.privacy,
    });
  });

  it('stores the choice under the key that names what was agreed to', () => {
    expect(MARKETING_EMAIL_CHOICE_STORAGE_KEY).toBe('agi.marketing-email-notice-version');
    expect(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY).toBe('agi.marketing-email-attempt-id');
  });

  it('removes a choice an earlier attempt left when this attempt did not tick the box', () => {
    writeSignupAttemptMarkers({ marketingEmail: true, ageCheckedAgainst: null });

    writeSignupAttemptMarkers({ marketingEmail: false, ageCheckedAgainst: null });

    expect(stored(TERMS_GATE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.terms);
    expect(stored(MARKETING_EMAIL_CHOICE_STORAGE_KEY)).toBeNull();
    expect(stored(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY)).toBeNull();
    expect(heldByThisTab(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY)).toBeNull();
    expect(readCarriedMarketingEmailChoice()).toEqual({ kind: 'none' });
  });

  it('clears every marker together', () => {
    writeSignupAttemptMarkers({ marketingEmail: true, ageCheckedAgainst: null });

    clearSignupAttemptMarkers();

    expect(stored(TERMS_GATE_STORAGE_KEY)).toBeNull();
    expect(stored(MARKETING_EMAIL_CHOICE_STORAGE_KEY)).toBeNull();
    expect(stored(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY)).toBeNull();
    expect(heldByThisTab(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY)).toBeNull();
    expect(hasCurrentTermsGateMarker()).toBe(false);
    expect(readCarriedMarketingEmailChoice()).toEqual({ kind: 'none' });
  });

  it('reads a choice made against an earlier notice as stale, never as a grant', () => {
    writeSignupAttemptMarkers({ marketingEmail: true, ageCheckedAgainst: null });
    window.localStorage.setItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY, '1970-01-01');

    expect(readCarriedMarketingEmailChoice()).toEqual({ kind: 'stale' });
  });

  it('keeps the two versions apart, so neither policy date can stand in for the other', () => {
    expect(POLICY_LAST_UPDATED.terms).not.toBe(POLICY_LAST_UPDATED.privacy);
    writeSignupAttemptMarkers({ marketingEmail: true, ageCheckedAgainst: null });
    window.localStorage.setItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY, POLICY_LAST_UPDATED.terms);
    window.localStorage.setItem(TERMS_GATE_STORAGE_KEY, POLICY_LAST_UPDATED.privacy);

    expect(readCarriedMarketingEmailChoice()).toEqual({ kind: 'stale' });
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

    expect(() =>
      writeSignupAttemptMarkers({ marketingEmail: true, ageCheckedAgainst: null }),
    ).not.toThrow();
    expect(() => clearSignupAttemptMarkers()).not.toThrow();
    expect(hasCurrentTermsGateMarker()).toBe(false);
    expect(readCarriedMarketingEmailChoice()).toEqual({ kind: 'none' });
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

    writeSignupAttemptMarkers({ marketingEmail: true, ageCheckedAgainst: null });

    expect(attempted).toEqual([TERMS_GATE_STORAGE_KEY]);
    expect(stored(MARKETING_EMAIL_CHOICE_STORAGE_KEY)).toBeNull();
    expect(stored(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY)).toBeNull();
  });
});

describe('the age check of one sign-up attempt', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('stores the minimum age the screen checked against under its own key', () => {
    expect(AGE_CHECK_STORAGE_KEY).toBe('agi.age-checked-minimum');

    writeSignupAttemptMarkers({ marketingEmail: false, ageCheckedAgainst: 18 });

    expect(stored(AGE_CHECK_STORAGE_KEY)).toBe('18');
    expect(stored(TERMS_GATE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.terms);
    expect(readCarriedAgeCheck()).toBe(18);
  });

  it('stores the minimum beside a ticked marketing email choice without disturbing it', () => {
    writeSignupAttemptMarkers({ marketingEmail: true, ageCheckedAgainst: 18 });

    expect(readCarriedAgeCheck()).toBe(18);
    expect(readCarriedMarketingEmailChoice()).toEqual({
      kind: 'current',
      noticeVersion: POLICY_LAST_UPDATED.privacy,
    });
  });

  it('reads no check where none was written', () => {
    expect(readCarriedAgeCheck()).toBeNull();

    writeSignupAttemptMarkers({ marketingEmail: false, ageCheckedAgainst: null });

    expect(stored(AGE_CHECK_STORAGE_KEY)).toBeNull();
    expect(readCarriedAgeCheck()).toBeNull();
  });

  it('removes a check an earlier attempt left when this attempt asked no age', () => {
    writeSignupAttemptMarkers({ marketingEmail: false, ageCheckedAgainst: 18 });

    writeSignupAttemptMarkers({ marketingEmail: false, ageCheckedAgainst: null });

    expect(stored(AGE_CHECK_STORAGE_KEY)).toBeNull();
    expect(stored(TERMS_GATE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.terms);
    expect(readCarriedAgeCheck()).toBeNull();
  });

  it('clears the check with every other marker', () => {
    writeSignupAttemptMarkers({ marketingEmail: true, ageCheckedAgainst: 18 });

    clearSignupAttemptMarkers();

    expect(stored(AGE_CHECK_STORAGE_KEY)).toBeNull();
    expect(stored(TERMS_GATE_STORAGE_KEY)).toBeNull();
    expect(readCarriedAgeCheck()).toBeNull();
  });

  it.each([['abc'], [''], ['-18'], ['18.5'], ['1e2'], ['1000'], [' 18'], ['18 '], ['0x12']])(
    'reads a stored value of %j as no check',
    (value) => {
      window.localStorage.setItem(AGE_CHECK_STORAGE_KEY, value);

      expect(readCarriedAgeCheck()).toBeNull();
    },
  );

  it('reads no check when the browser refuses storage, and writes none', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    expect(() =>
      writeSignupAttemptMarkers({ marketingEmail: false, ageCheckedAgainst: 18 }),
    ).not.toThrow();
    expect(readCarriedAgeCheck()).toBeNull();
  });
});

describe('the attempt a carried choice belongs to', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps one random id beside the choice and in this tab', () => {
    writeSignupAttemptMarkers({ marketingEmail: true, ageCheckedAgainst: null });

    const attemptId = stored(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY);
    expect(attemptId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(heldByThisTab(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY)).toBe(attemptId);
  });

  it('gives every admitted attempt its own id', () => {
    writeSignupAttemptMarkers({ marketingEmail: true, ageCheckedAgainst: null });
    const first = stored(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY);

    writeSignupAttemptMarkers({ marketingEmail: true, ageCheckedAgainst: null });

    expect(stored(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY)).not.toBe(first);
    expect(heldByThisTab(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY)).toBe(
      stored(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY),
    );
  });

  it('keeps no id for an attempt admitted with the box empty', () => {
    writeSignupAttemptMarkers({ marketingEmail: false, ageCheckedAgainst: null });

    expect(stored(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY)).toBeNull();
    expect(heldByThisTab(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY)).toBeNull();
  });

  it('reads the choice as a grant only in the tab that holds its id', () => {
    writeSignupAttemptMarkers({ marketingEmail: true, ageCheckedAgainst: null });

    expect(readCarriedMarketingEmailChoice().kind).toBe('current');
  });

  it('reads a choice ticked in another tab as another attempt, never as a grant', () => {
    writeSignupAttemptMarkers({ marketingEmail: true, ageCheckedAgainst: null });
    openAnotherTab();

    expect(readCarriedMarketingEmailChoice()).toEqual({ kind: 'other_attempt' });
  });

  it('reads a choice as another attempt when this tab holds the id of a different one', () => {
    writeSignupAttemptMarkers({ marketingEmail: true, ageCheckedAgainst: null });
    window.sessionStorage.setItem(
      MARKETING_EMAIL_ATTEMPT_STORAGE_KEY,
      '00000000-0000-4000-8000-000000000000',
    );

    expect(readCarriedMarketingEmailChoice()).toEqual({ kind: 'other_attempt' });
  });

  it.each([
    ['is missing', null],
    ['is empty', ''],
  ])('reads a choice whose id %s as another attempt', (_case, carriedId) => {
    writeSignupAttemptMarkers({ marketingEmail: true, ageCheckedAgainst: null });
    if (carriedId === null) window.localStorage.removeItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY);
    else {
      window.localStorage.setItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY, carriedId);
      window.sessionStorage.setItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY, carriedId);
    }

    expect(readCarriedMarketingEmailChoice()).toEqual({ kind: 'other_attempt' });
  });

  it('reads a choice the tab could not be tied to as another attempt, so it is asked again', () => {
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (this === window.sessionStorage) throw new DOMException('denied', 'SecurityError');
      setItem.call(this, key, value);
    });

    writeSignupAttemptMarkers({ marketingEmail: true, ageCheckedAgainst: null });

    expect(stored(MARKETING_EMAIL_CHOICE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.privacy);
    expect(heldByThisTab(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY)).toBeNull();
    expect(readCarriedMarketingEmailChoice()).toEqual({ kind: 'other_attempt' });
  });

  it('reads a tab whose ticked choice another tab removed as another attempt, so it is asked again', () => {
    writeSignupAttemptMarkers({ marketingEmail: true, ageCheckedAgainst: null });
    const thisTab = heldByThisTab(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY);
    openAnotherTab();
    writeSignupAttemptMarkers({ marketingEmail: false, ageCheckedAgainst: null });
    window.sessionStorage.setItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY, String(thisTab));

    expect(stored(MARKETING_EMAIL_CHOICE_STORAGE_KEY)).toBeNull();
    expect(readCarriedMarketingEmailChoice()).toEqual({ kind: 'other_attempt' });
  });

  it('reads a tab whose ticked choice another tab cleared as another attempt', () => {
    writeSignupAttemptMarkers({ marketingEmail: true, ageCheckedAgainst: null });
    const thisTab = heldByThisTab(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY);
    openAnotherTab();
    clearSignupAttemptMarkers();
    window.sessionStorage.setItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY, String(thisTab));

    expect(readCarriedMarketingEmailChoice()).toEqual({ kind: 'other_attempt' });
  });

  it('carries nothing to ask again about once this tab itself started over with the box empty', () => {
    writeSignupAttemptMarkers({ marketingEmail: true, ageCheckedAgainst: null });

    writeSignupAttemptMarkers({ marketingEmail: false, ageCheckedAgainst: null });

    expect(heldByThisTab(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY)).toBeNull();
    expect(readCarriedMarketingEmailChoice()).toEqual({ kind: 'none' });
  });

  it('reads no attempt in this tab when the tab refuses to say what it holds', () => {
    writeSignupAttemptMarkers({ marketingEmail: false, ageCheckedAgainst: null });
    const getItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (this === window.sessionStorage) throw new DOMException('denied', 'SecurityError');
      return getItem.call(this, key);
    });

    expect(readCarriedMarketingEmailChoice()).toEqual({ kind: 'none' });
  });

  it('leaves a choice no tab can claim when the attempt id cannot be made, so it is asked again', () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new TypeError('crypto.randomUUID is not a function');
    });

    expect(() =>
      writeSignupAttemptMarkers({ marketingEmail: true, ageCheckedAgainst: null }),
    ).not.toThrow();

    expect(stored(TERMS_GATE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.terms);
    expect(stored(MARKETING_EMAIL_CHOICE_STORAGE_KEY)).toBe(POLICY_LAST_UPDATED.privacy);
    expect(stored(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY)).toBeNull();
    expect(heldByThisTab(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY)).toBeNull();
    expect(readCarriedMarketingEmailChoice()).toEqual({ kind: 'other_attempt' });
  });

  it('checks the notice before the attempt, so an outdated choice is stale in any tab', () => {
    writeSignupAttemptMarkers({ marketingEmail: true, ageCheckedAgainst: null });
    window.localStorage.setItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY, '1970-01-01');
    openAnotherTab();

    expect(readCarriedMarketingEmailChoice()).toEqual({ kind: 'stale' });
  });

  it('asks again for a stale choice and for another attempt, and for nothing else', () => {
    expect(carriedChoiceMustBeAskedAgain({ kind: 'stale' })).toBe(true);
    expect(carriedChoiceMustBeAskedAgain({ kind: 'other_attempt' })).toBe(true);
    expect(carriedChoiceMustBeAskedAgain({ kind: 'none' })).toBe(false);
    expect(
      carriedChoiceMustBeAskedAgain({
        kind: 'current',
        noticeVersion: POLICY_LAST_UPDATED.privacy,
      }),
    ).toBe(false);
  });
});
