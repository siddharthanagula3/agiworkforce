export const ACCOUNT_MINIMUM_AGE = 13;

export const PARENTAL_PERMISSION_BELOW_AGE = 18;

const OLDEST_PLAUSIBLE_AGE = 120;

export const ACCOUNT_AGE_FIELD_LABEL = 'Your age';

export const ACCOUNT_AGE_REQUIREMENT_NOTICE = `You must be at least ${ACCOUNT_MINIMUM_AGE} years old to create an account. If you are under ${PARENTAL_PERMISSION_BELOW_AGE}, you need permission from a parent or guardian.`;

export const ACCOUNT_AGE_REQUIRED_MESSAGE = 'Enter your age in years to continue.';

export const ACCOUNT_AGE_INELIGIBLE_MESSAGE = `You must be at least ${ACCOUNT_MINIMUM_AGE} years old to create an account.`;

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
