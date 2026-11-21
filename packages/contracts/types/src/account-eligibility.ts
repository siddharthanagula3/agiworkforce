export const ACCOUNT_MINIMUM_AGE = 18;

const OLDEST_PLAUSIBLE_AGE = 120;

export const ACCOUNT_AGE_FIELD_LABEL = 'Your age';

export const ACCOUNT_AGE_REQUIREMENT_NOTICE = `This service is for adults. You must be at least ${ACCOUNT_MINIMUM_AGE} years old to use it.`;

export const ACCOUNT_AGE_REQUIRED_MESSAGE = 'Enter your age in years to continue.';

export const ACCOUNT_AGE_INELIGIBLE_MESSAGE = `You must be at least ${ACCOUNT_MINIMUM_AGE} years old to continue.`;

export type AccountAgeVerdict = 'missing' | 'invalid' | 'too_young' | 'eligible';

export function evaluateAccountAge(entry: string): AccountAgeVerdict {
  const typed = entry.trim();
  if (typed.length === 0) return 'missing';
  if (!/^\d{1,3}$/.test(typed)) return 'invalid';
  const age = Number(typed);
  if (age === 0 || age > OLDEST_PLAUSIBLE_AGE) return 'invalid';
  return age < ACCOUNT_MINIMUM_AGE ? 'too_young' : 'eligible';
}

export type AccountAgeRefusal = Exclude<AccountAgeVerdict, 'eligible'>;

export function accountAgeRefusalMessage(verdict: AccountAgeVerdict): string | null {
  if (verdict === 'eligible') return null;
  return verdict === 'too_young' ? ACCOUNT_AGE_INELIGIBLE_MESSAGE : ACCOUNT_AGE_REQUIRED_MESSAGE;
}

/**
 * How an eligibility decision was reached. A decision records that the person
 * met a minimum age, never the age or a birth date behind it.
 */
export const ADULT_ELIGIBILITY_METHODS = ['declared_age', 'platform_age_signal'] as const;

export type AdultEligibilityMethod = (typeof ADULT_ELIGIBILITY_METHODS)[number];

export interface AdultEligibilityDecision {
  minimumAge: number;
  method: AdultEligibilityMethod;
  decidedAt: string;
}

/**
 * `declared_age`: the age as the person typed it, for the receiver to judge.
 * `age_checked_on_device`: a surface judged the typed age itself, before any
 * account existed or without keeping the number, and carries only the minimum
 * it judged against. `platform_age_signal`: the range the operating system
 * reported.
 */
export type AdultEligibilityEvidence =
  | { kind: 'declared_age'; age: number }
  | { kind: 'age_checked_on_device'; minimumAge: number }
  | { kind: 'platform_age_signal'; lowerBound: number | null; upperBound: number | null };

export type AdultEligibilityVerdict = 'eligible' | 'ineligible' | 'inconclusive';

/**
 * The one rule that turns evidence into a verdict, on every surface and on the
 * server. A check made against a lower minimum, and an operating system range
 * that straddles the minimum or carries no bounds, settle nothing: the verdict
 * is inconclusive and the person is asked for their age.
 */
export function decideAdultEligibility(
  evidence: AdultEligibilityEvidence,
): AdultEligibilityVerdict {
  if (evidence.kind === 'declared_age') {
    const verdict = evaluateAccountAge(String(evidence.age));
    if (verdict === 'eligible') return 'eligible';
    return verdict === 'too_young' ? 'ineligible' : 'inconclusive';
  }
  if (evidence.kind === 'age_checked_on_device') {
    return adultEligibilityIsCurrent(evidence) ? 'eligible' : 'inconclusive';
  }
  const { lowerBound, upperBound } = evidence;
  if (lowerBound !== null && lowerBound >= ACCOUNT_MINIMUM_AGE) return 'eligible';
  if (upperBound !== null && upperBound < ACCOUNT_MINIMUM_AGE) return 'ineligible';
  return 'inconclusive';
}

export function adultEligibilityMethodOf(
  evidence: AdultEligibilityEvidence,
): AdultEligibilityMethod {
  return evidence.kind === 'platform_age_signal' ? 'platform_age_signal' : 'declared_age';
}

/**
 * A decision counts only while the age it was made against is at least the
 * current minimum. One made under an earlier, lower minimum proves nothing
 * about the current one, so its holder is asked again.
 */
export function adultEligibilityIsCurrent(
  decision: Pick<AdultEligibilityDecision, 'minimumAge'> | null | undefined,
): boolean {
  return (
    decision !== null &&
    decision !== undefined &&
    Number.isInteger(decision.minimumAge) &&
    decision.minimumAge >= ACCOUNT_MINIMUM_AGE
  );
}
