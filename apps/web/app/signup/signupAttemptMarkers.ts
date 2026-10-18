import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';

/**
 * localStorage so the terms marker survives the provider round trip. The
 * marketing choice is bound to this tab's attempt id and is never read as a
 * grant from another attempt.
 */
export const TERMS_GATE_STORAGE_KEY = 'agi.terms-accepted-version';
export const MARKETING_EMAIL_CHOICE_STORAGE_KEY = 'agi.marketing-email-notice-version';
export const MARKETING_EMAIL_ATTEMPT_STORAGE_KEY = 'agi.marketing-email-attempt-id';

export interface SignupAttemptChoices {
  marketingEmail: boolean;
}

export type CarriedMarketingEmailChoice =
  | { kind: 'none' }
  | { kind: 'stale' }
  | { kind: 'other_attempt' }
  | { kind: 'current'; noticeVersion: string };

function forget(area: () => Storage, key: string): void {
  try {
    area().removeItem(key);
  } catch {
    return;
  }
}

function clearMarketingEmailChoice(): void {
  forget(() => window.localStorage, MARKETING_EMAIL_CHOICE_STORAGE_KEY);
  forget(() => window.localStorage, MARKETING_EMAIL_ATTEMPT_STORAGE_KEY);
  forget(() => window.sessionStorage, MARKETING_EMAIL_ATTEMPT_STORAGE_KEY);
}

// The choice is written before its id: a write that stops part-way leaves a
// choice no tab can claim, which is asked again rather than silently dropped.
export function writeSignupAttemptMarkers(choices: SignupAttemptChoices): void {
  clearMarketingEmailChoice();
  try {
    window.localStorage.setItem(TERMS_GATE_STORAGE_KEY, POLICY_LAST_UPDATED.terms);
    if (!choices.marketingEmail) return;
    window.localStorage.setItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY, POLICY_LAST_UPDATED.privacy);
    const attemptId = crypto.randomUUID();
    window.localStorage.setItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY, attemptId);
    window.sessionStorage.setItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY, attemptId);
  } catch {
    return;
  }
}

export function clearSignupAttemptMarkers(): void {
  clearMarketingEmailChoice();
  forget(() => window.localStorage, TERMS_GATE_STORAGE_KEY);
}

export function hasCurrentTermsGateMarker(): boolean {
  try {
    return window.localStorage.getItem(TERMS_GATE_STORAGE_KEY) === POLICY_LAST_UPDATED.terms;
  } catch {
    return false;
  }
}

function choiceWasMadeInThisTab(): boolean {
  try {
    const carriedId = window.localStorage.getItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY);
    if (!carriedId) return false;
    return window.sessionStorage.getItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY) === carriedId;
  } catch {
    return false;
  }
}

function thisTabStillHoldsAnAttempt(): boolean {
  try {
    return Boolean(window.sessionStorage.getItem(MARKETING_EMAIL_ATTEMPT_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function readCarriedMarketingEmailChoice(): CarriedMarketingEmailChoice {
  let noticeVersion: string | null;
  try {
    noticeVersion = window.localStorage.getItem(MARKETING_EMAIL_CHOICE_STORAGE_KEY);
  } catch {
    return { kind: 'none' };
  }
  if (noticeVersion === null) {
    return thisTabStillHoldsAnAttempt() ? { kind: 'other_attempt' } : { kind: 'none' };
  }
  if (noticeVersion !== POLICY_LAST_UPDATED.privacy) return { kind: 'stale' };
  return choiceWasMadeInThisTab() ? { kind: 'current', noticeVersion } : { kind: 'other_attempt' };
}

export function carriedChoiceMustBeAskedAgain(choice: CarriedMarketingEmailChoice): boolean {
  return choice.kind === 'stale' || choice.kind === 'other_attempt';
}
