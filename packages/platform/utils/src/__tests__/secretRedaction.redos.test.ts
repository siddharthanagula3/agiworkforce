import { describe, expect, it } from 'vitest';

import { REDACTION_POLICIES, redactWithPolicy, type RedactionPolicy } from '../secretRedaction';

const LENGTH = 50_000;
const BUDGET_MS = 50;
const repeated = (unit: string) => unit.repeat(Math.ceil(LENGTH / unit.length)).slice(0, LENGTH);

/** Inputs that made a policy rule backtrack quadratically before its quantifiers were bounded. */
const ADVERSARIAL: Record<string, string> = {
  'scheme-like word runs': repeated('a-'),
  'dotted word runs': repeated('a.'),
  'repeated database schemes without an @': repeated('redis://a:'),
  'repeated url userinfo without an @': repeated('h://a:'),
  'credential names without an assignment': repeated('token-'),
  'credential names run together': repeated('token'),
  'an unclosed quoted credential': `token:'${repeated('xtoken:')}`,
  'a credential name before endless whitespace': `token${' '.repeat(LENGTH)}`,
  'password words': repeated('password '),
};

describe('every redaction policy stays linear on hostile input', () => {
  const cases = (Object.keys(REDACTION_POLICIES) as RedactionPolicy[]).flatMap((policy) =>
    Object.entries(ADVERSARIAL).map(([name, text]) => [policy, name, text] as const),
  );

  it.each(cases)('%s on %s', (policy, _name, text) => {
    redactWithPolicy(text.slice(0, 1_000), policy);
    const started = performance.now();
    redactWithPolicy(text, policy);
    expect(performance.now() - started).toBeLessThan(BUDGET_MS);
  });
});
