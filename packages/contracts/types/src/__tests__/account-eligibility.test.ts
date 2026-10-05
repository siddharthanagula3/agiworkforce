import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_AGE_CONFIRMATION_LABEL,
  ACCOUNT_AGE_REQUIREMENT_NOTICE,
  ACCOUNT_HOLDER_MINIMUM_AGE,
  ACCOUNT_SIGNUP_CONSENT_REQUIRED_MESSAGE,
  SUPERVISED_ACCOUNT_MINIMUM_AGE,
} from '../account-eligibility';

const AGE = String(ACCOUNT_HOLDER_MINIMUM_AGE);

function numbersIn(sentence: string): string[] {
  return sentence.match(/\d+/g) ?? [];
}

describe('account eligibility copy', () => {
  it('opens an account to adults and supervises younger teens', () => {
    expect(ACCOUNT_HOLDER_MINIMUM_AGE).toBeGreaterThan(SUPERVISED_ACCOUNT_MINIMUM_AGE);
  });

  it('states the minimum age once, as the age clause of the sign-up checkbox', () => {
    expect(ACCOUNT_AGE_CONFIRMATION_LABEL).toBe(`I am at least ${AGE} years old`);
    expect(numbersIn(ACCOUNT_AGE_CONFIRMATION_LABEL)).toEqual([AGE]);
  });

  it('refuses a sign-up attempt with the same age the checkbox asks for', () => {
    expect(ACCOUNT_SIGNUP_CONSENT_REQUIRED_MESSAGE).toContain(`at least ${AGE}`);
    expect(ACCOUNT_SIGNUP_CONSENT_REQUIRED_MESSAGE).toContain('accept the terms');
    expect(numbersIn(ACCOUNT_SIGNUP_CONSENT_REQUIRED_MESSAGE)).toEqual([AGE]);
  });

  it('derives every age in the detailed rule from the two thresholds', () => {
    expect(numbersIn(ACCOUNT_AGE_REQUIREMENT_NOTICE)).toEqual([
      AGE,
      String(SUPERVISED_ACCOUNT_MINIMUM_AGE),
      String(ACCOUNT_HOLDER_MINIMUM_AGE - 1),
    ]);
  });
});
