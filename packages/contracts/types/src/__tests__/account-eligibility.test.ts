import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_AGE_INELIGIBLE_MESSAGE,
  ACCOUNT_AGE_REQUIRED_MESSAGE,
  ACCOUNT_AGE_REQUIREMENT_NOTICE,
  ACCOUNT_MINIMUM_AGE,
  accountAgeRefusalMessage,
  adultEligibilityIsCurrent,
  adultEligibilityMethodOf,
  decideAdultEligibility,
  evaluateAccountAge,
} from '../account-eligibility';

const LEGACY_MINIMUM_AGE = 13;

function numbersIn(sentence: string): string[] {
  return sentence.match(/\d+/g) ?? [];
}

describe('account eligibility', () => {
  it('is for adults only', () => {
    expect(ACCOUNT_MINIMUM_AGE).toBe(18);
  });

  it('derives the only age in the published rule from the one threshold', () => {
    expect(numbersIn(ACCOUNT_AGE_REQUIREMENT_NOTICE)).toEqual([String(ACCOUNT_MINIMUM_AGE)]);
    expect(numbersIn(ACCOUNT_AGE_INELIGIBLE_MESSAGE)).toEqual([String(ACCOUNT_MINIMUM_AGE)]);
  });

  it('offers no parental permission route for a younger person', () => {
    for (const sentence of [ACCOUNT_AGE_REQUIREMENT_NOTICE, ACCOUNT_AGE_INELIGIBLE_MESSAGE]) {
      expect(sentence).not.toMatch(/parent|guardian|permission/i);
    }
  });

  it('admits 18 and everyone older', () => {
    expect(evaluateAccountAge('18')).toBe('eligible');
    expect(evaluateAccountAge(String(ACCOUNT_MINIMUM_AGE))).toBe('eligible');
    expect(evaluateAccountAge(' 42 ')).toBe('eligible');
    expect(evaluateAccountAge('120')).toBe('eligible');
  });

  it('refuses 17 and everyone younger, the ages the earlier rule admitted included', () => {
    expect(evaluateAccountAge('17')).toBe('too_young');
    expect(evaluateAccountAge(String(ACCOUNT_MINIMUM_AGE - 1))).toBe('too_young');
    expect(evaluateAccountAge(String(LEGACY_MINIMUM_AGE))).toBe('too_young');
    expect(evaluateAccountAge('1')).toBe('too_young');
  });

  it('tells an empty field apart from an entry that is not an age', () => {
    expect(evaluateAccountAge('')).toBe('missing');
    expect(evaluateAccountAge('   ')).toBe('missing');
    for (const entry of ['0', '121', '999', '1000', '-5', '17.9', 'eighteen', '1e2', '+18']) {
      expect(evaluateAccountAge(entry)).toBe('invalid');
    }
  });

  it('words each refusal, and none for an eligible age', () => {
    expect(accountAgeRefusalMessage('eligible')).toBeNull();
    expect(accountAgeRefusalMessage('too_young')).toBe(ACCOUNT_AGE_INELIGIBLE_MESSAGE);
    expect(accountAgeRefusalMessage('missing')).toBe(ACCOUNT_AGE_REQUIRED_MESSAGE);
    expect(accountAgeRefusalMessage('invalid')).toBe(ACCOUNT_AGE_REQUIRED_MESSAGE);
  });
});

describe('a recorded eligibility decision', () => {
  it('counts when it was made against the current minimum age', () => {
    expect(adultEligibilityIsCurrent({ minimumAge: ACCOUNT_MINIMUM_AGE })).toBe(true);
  });

  it('still counts when it was made against a stricter minimum', () => {
    expect(adultEligibilityIsCurrent({ minimumAge: ACCOUNT_MINIMUM_AGE + 3 })).toBe(true);
  });

  it('does not count when it was made under the earlier 13 and over rule', () => {
    expect(adultEligibilityIsCurrent({ minimumAge: LEGACY_MINIMUM_AGE })).toBe(false);
    expect(adultEligibilityIsCurrent({ minimumAge: ACCOUNT_MINIMUM_AGE - 1 })).toBe(false);
  });

  it('does not count when nothing was recorded or the record is not a whole age', () => {
    expect(adultEligibilityIsCurrent(null)).toBe(false);
    expect(adultEligibilityIsCurrent(undefined)).toBe(false);
    expect(adultEligibilityIsCurrent({ minimumAge: Number.NaN })).toBe(false);
    expect(adultEligibilityIsCurrent({ minimumAge: 18.5 })).toBe(false);
  });
});

describe('deciding eligibility from evidence', () => {
  const range = (lowerBound: number | null, upperBound: number | null) =>
    decideAdultEligibility({ kind: 'platform_age_signal', lowerBound, upperBound });

  it('accepts a declared age of 18 and refuses 17', () => {
    expect(decideAdultEligibility({ kind: 'declared_age', age: 18 })).toBe('eligible');
    expect(decideAdultEligibility({ kind: 'declared_age', age: 17 })).toBe('ineligible');
    expect(decideAdultEligibility({ kind: 'declared_age', age: 13 })).toBe('ineligible');
  });

  it('treats a declared age that is not a plausible whole age as no answer', () => {
    for (const age of [0, 121, -3, 17.5, Number.NaN]) {
      expect(decideAdultEligibility({ kind: 'declared_age', age })).toBe('inconclusive');
    }
  });

  it('accepts an age a surface checked against the current minimum', () => {
    expect(
      decideAdultEligibility({ kind: 'age_checked_on_device', minimumAge: ACCOUNT_MINIMUM_AGE }),
    ).toBe('eligible');
  });

  it('settles nothing from an age checked against the earlier 13 and over rule', () => {
    expect(
      decideAdultEligibility({ kind: 'age_checked_on_device', minimumAge: LEGACY_MINIMUM_AGE }),
    ).toBe('inconclusive');
    expect(decideAdultEligibility({ kind: 'age_checked_on_device', minimumAge: 16 })).toBe(
      'inconclusive',
    );
  });

  it('accepts an operating system range that starts at 18 or above', () => {
    expect(range(18, null)).toBe('eligible');
    expect(range(21, 25)).toBe('eligible');
  });

  it('refuses an operating system range that ends below 18', () => {
    expect(range(13, 17)).toBe('ineligible');
    expect(range(null, 12)).toBe('ineligible');
  });

  it('settles nothing from a range that straddles 18 or carries no bounds', () => {
    expect(range(16, 18)).toBe('inconclusive');
    expect(range(13, null)).toBe('inconclusive');
    expect(range(null, null)).toBe('inconclusive');
  });

  it('records a typed or device-checked age as declared, and a range as the platform signal', () => {
    expect(adultEligibilityMethodOf({ kind: 'declared_age', age: 30 })).toBe('declared_age');
    expect(adultEligibilityMethodOf({ kind: 'age_checked_on_device', minimumAge: 18 })).toBe(
      'declared_age',
    );
    expect(
      adultEligibilityMethodOf({ kind: 'platform_age_signal', lowerBound: 18, upperBound: null }),
    ).toBe('platform_age_signal');
  });
});
