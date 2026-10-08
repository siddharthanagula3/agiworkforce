import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_AGE_INELIGIBLE_MESSAGE,
  ACCOUNT_AGE_REQUIRED_MESSAGE,
  ACCOUNT_AGE_REQUIREMENT_NOTICE,
  ACCOUNT_MINIMUM_AGE,
  PARENTAL_PERMISSION_BELOW_AGE,
  accountAgeRefusalMessage,
  evaluateAccountAge,
} from '../account-eligibility';

function numbersIn(sentence: string): string[] {
  return sentence.match(/\d+/g) ?? [];
}

describe('account eligibility', () => {
  it('asks younger account holders for a parent or guardian', () => {
    expect(PARENTAL_PERMISSION_BELOW_AGE).toBeGreaterThan(ACCOUNT_MINIMUM_AGE);
  });

  it('derives every age in the published rule from the two thresholds', () => {
    expect(numbersIn(ACCOUNT_AGE_REQUIREMENT_NOTICE)).toEqual([
      String(ACCOUNT_MINIMUM_AGE),
      String(PARENTAL_PERMISSION_BELOW_AGE),
    ]);
    expect(numbersIn(ACCOUNT_AGE_INELIGIBLE_MESSAGE)).toEqual([String(ACCOUNT_MINIMUM_AGE)]);
  });

  it('admits the minimum age and everyone older', () => {
    expect(evaluateAccountAge(String(ACCOUNT_MINIMUM_AGE))).toBe('eligible');
    expect(evaluateAccountAge(String(PARENTAL_PERMISSION_BELOW_AGE - 1))).toBe('eligible');
    expect(evaluateAccountAge(' 42 ')).toBe('eligible');
    expect(evaluateAccountAge('120')).toBe('eligible');
  });

  it('refuses an age below the minimum', () => {
    expect(evaluateAccountAge(String(ACCOUNT_MINIMUM_AGE - 1))).toBe('too_young');
    expect(evaluateAccountAge('1')).toBe('too_young');
  });

  it('tells an empty field apart from an entry that is not an age', () => {
    expect(evaluateAccountAge('')).toBe('missing');
    expect(evaluateAccountAge('   ')).toBe('missing');
    for (const entry of ['0', '121', '999', '1000', '-5', '12.5', 'twelve', '1e2', '+18']) {
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
