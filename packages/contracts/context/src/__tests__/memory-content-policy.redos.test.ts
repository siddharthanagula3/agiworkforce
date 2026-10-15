import { describe, expect, it } from 'vitest';

import {
  prohibitedMemoryCategory,
  prohibitedMemoryRules,
  sensitiveMemoryRules,
  sensitiveMemoryTopic,
} from '../memory-content-policy';

const LENGTH = 40_000;
const BUDGET_MS = 100;
const repeated = (unit: string) => unit.repeat(Math.ceil(LENGTH / unit.length)).slice(0, LENGTH);

const ADVERSARIAL: Record<string, string> = {
  'hyphenated word runs': repeated('a-'),
  'umlaut word runs': repeated('aä'),
  'prefix runs': repeated('ex-'),
  'street suffixes without a number': repeated('straße'),
  'self-descriptions without a value': repeated('user is a '),
  'noun phrases without a condition': repeated('user is a vet with '),
  'digit runs': repeated('12345 '),
  'credential names without a value': repeated('token is '),
  'descriptor runs without a value': repeated('user is a 34 year old '),
  'conjunctions without a value': repeated('user is a nurse and a '),
  'relative clauses without a value': repeated('she is a nurse who is '),
};

describe('every memory content rule stays linear on hostile input', () => {
  const cases = [...prohibitedMemoryRules(), ...sensitiveMemoryRules()].flatMap((rule) =>
    Object.entries(ADVERSARIAL).map(([name, text]) => [rule.id, name, rule, text] as const),
  );

  it.each(cases)('%s on %s', (_id, _name, rule, text) => {
    rule.matches(text.slice(0, 1_000));
    const started = performance.now();
    rule.matches(text);
    expect(performance.now() - started).toBeLessThan(BUDGET_MS);
  });
});

const SCREEN_BUDGET_MS = 1_000;

const SCREEN_LENGTH = 20_000;

const FIRST_PERSON: Record<string, string> = {
  'first-person predicates after adverbs': repeated('i still no longer take '),
  'contractions without apostrophes': repeated('im ive im '),
  'statements about the speaker': repeated('i am i am '),
};

describe('the whole screen stays linear on first-person input', () => {
  it.each(Object.entries(FIRST_PERSON))('%s', (_name, text) => {
    const screened = text.slice(0, SCREEN_LENGTH);
    prohibitedMemoryCategory(screened.slice(0, 1_000));
    sensitiveMemoryTopic(screened.slice(0, 1_000));
    const started = performance.now();
    prohibitedMemoryCategory(screened);
    sensitiveMemoryTopic(screened);
    expect(performance.now() - started).toBeLessThan(SCREEN_BUDGET_MS);
  });
});
