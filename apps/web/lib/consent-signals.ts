import { CONSENT_PURPOSES } from '@/lib/consent-purposes';

export const GLOBAL_PRIVACY_CONTROL_HEADER = 'sec-gpc';

export const GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE =
  "Held off by this browser's Global Privacy Control.";

export const NON_ESSENTIAL_CONSENT_PURPOSE_IDS: readonly string[] = Object.freeze(
  CONSENT_PURPOSES.filter((purpose) => !purpose.necessaryForRequest).map((purpose) => purpose.id),
);

const NON_ESSENTIAL_IDS: ReadonlySet<string> = new Set(NON_ESSENTIAL_CONSENT_PURPOSE_IDS);

export function isNonEssentialConsentPurpose(purpose: string): boolean {
  return NON_ESSENTIAL_IDS.has(purpose);
}

// A browser sending Global Privacy Control has refused every purpose that is
// not needed to serve it, so a grant for one is recorded as the refusal it is.
export function grantedUnderGlobalPrivacyControl(
  decision: { purpose: string; granted: boolean },
  optedOut: boolean,
): boolean {
  return optedOut && isNonEssentialConsentPurpose(decision.purpose) ? false : decision.granted;
}

export function isGlobalPrivacyControlValue(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() === '1';
}

export function readGlobalPrivacyControlHeader(headers: {
  get(name: string): string | null;
}): boolean {
  return isGlobalPrivacyControlValue(headers.get(GLOBAL_PRIVACY_CONTROL_HEADER));
}

// The DOM property is the same statement as the header, made to script rather
// than to the server, so a browser that sends one and not the other is still
// opted out here.
export function readBrowserGlobalPrivacyControl(): boolean {
  if (typeof navigator === 'undefined' || navigator === null) return false;
  try {
    return (
      (navigator as Navigator & { globalPrivacyControl?: unknown }).globalPrivacyControl === true
    );
  } catch {
    return false;
  }
}
