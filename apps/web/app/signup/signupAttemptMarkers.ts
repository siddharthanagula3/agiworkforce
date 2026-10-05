import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';

/**
 * One sign-up attempt, two markers, written and cleared together so the
 * optional product-updates choice can never outlive the attempt it was made
 * in. Each holds the policy version that was on screen, so a revision
 * published before the account exists reads as stale rather than as agreement
 * to text nobody saw. localStorage, not sessionStorage: the terms marker has
 * to survive the tab closing during the provider round trip.
 *
 * That makes both markers browser-wide: they belong to the attempt admitted
 * last, in whichever tab. Nothing here tells two attempts in flight apart, so
 * an older one finished after a newer one was admitted records the newer
 * one's choice.
 */
export const TERMS_GATE_STORAGE_KEY = 'agi.terms-accepted-version';
export const PRODUCT_UPDATES_CHOICE_STORAGE_KEY = 'agi.product-updates-notice-version';

export interface SignupAttemptChoices {
  productUpdates: boolean;
}

export type CarriedProductUpdatesChoice =
  { kind: 'none' } | { kind: 'stale' } | { kind: 'current'; noticeVersion: string };

function clearProductUpdatesChoice(): void {
  try {
    window.localStorage.removeItem(PRODUCT_UPDATES_CHOICE_STORAGE_KEY);
  } catch {
    return;
  }
}

export function writeSignupAttemptMarkers(choices: SignupAttemptChoices): void {
  if (!choices.productUpdates) clearProductUpdatesChoice();
  try {
    window.localStorage.setItem(TERMS_GATE_STORAGE_KEY, POLICY_LAST_UPDATED.terms);
    if (choices.productUpdates) {
      window.localStorage.setItem(PRODUCT_UPDATES_CHOICE_STORAGE_KEY, POLICY_LAST_UPDATED.privacy);
    }
  } catch {
    return;
  }
}

export function clearSignupAttemptMarkers(): void {
  clearProductUpdatesChoice();
  try {
    window.localStorage.removeItem(TERMS_GATE_STORAGE_KEY);
  } catch {
    return;
  }
}

export function hasCurrentTermsGateMarker(): boolean {
  try {
    return window.localStorage.getItem(TERMS_GATE_STORAGE_KEY) === POLICY_LAST_UPDATED.terms;
  } catch {
    return false;
  }
}

export function readCarriedProductUpdatesChoice(): CarriedProductUpdatesChoice {
  let noticeVersion: string | null;
  try {
    noticeVersion = window.localStorage.getItem(PRODUCT_UPDATES_CHOICE_STORAGE_KEY);
  } catch {
    return { kind: 'none' };
  }
  if (noticeVersion === null) return { kind: 'none' };
  return noticeVersion === POLICY_LAST_UPDATED.privacy
    ? { kind: 'current', noticeVersion }
    : { kind: 'stale' };
}
