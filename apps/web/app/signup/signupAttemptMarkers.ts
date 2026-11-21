import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';

/**
 * localStorage so the terms marker survives the provider round trip.
 */
export const TERMS_GATE_STORAGE_KEY = 'agi.terms-accepted-version';

/**
 * Keys earlier sign-up screens wrote. Nothing writes them now; they are still
 * cleared so a value left by an earlier attempt does not outlive it.
 */
export const MARKETING_EMAIL_CHOICE_STORAGE_KEY = 'agi.marketing-email-notice-version';
export const MARKETING_EMAIL_ATTEMPT_STORAGE_KEY = 'agi.marketing-email-attempt-id';
export const AGE_CHECK_STORAGE_KEY = 'agi.age-checked-minimum';

function forget(area: () => Storage, key: string): void {
  try {
    area().removeItem(key);
  } catch {
    return;
  }
}

function clearEarlierAttemptKeys(): void {
  forget(() => window.localStorage, MARKETING_EMAIL_CHOICE_STORAGE_KEY);
  forget(() => window.localStorage, MARKETING_EMAIL_ATTEMPT_STORAGE_KEY);
  forget(() => window.sessionStorage, MARKETING_EMAIL_ATTEMPT_STORAGE_KEY);
  forget(() => window.localStorage, AGE_CHECK_STORAGE_KEY);
}

export function writeSignupAttemptMarkers(): void {
  clearEarlierAttemptKeys();
  try {
    window.localStorage.setItem(TERMS_GATE_STORAGE_KEY, POLICY_LAST_UPDATED.terms);
  } catch {
    return;
  }
}

export function clearSignupAttemptMarkers(): void {
  clearEarlierAttemptKeys();
  forget(() => window.localStorage, TERMS_GATE_STORAGE_KEY);
}

export function hasCurrentTermsGateMarker(): boolean {
  try {
    return window.localStorage.getItem(TERMS_GATE_STORAGE_KEY) === POLICY_LAST_UPDATED.terms;
  } catch {
    return false;
  }
}
