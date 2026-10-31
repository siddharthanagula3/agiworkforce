import { threadCpuUsage } from 'node:process';
import { describe, expect, it } from 'vitest';

import {
  REDACTION_POLICIES,
  SECRET_PATTERN_RULES,
  redactWithPolicy,
  type RedactionPolicy,
} from '../secretRedaction';

const LENGTH = 50_000;
const BUDGET_MS = 50;
const repeated = (unit: string) => unit.repeat(Math.ceil(LENGTH / unit.length)).slice(0, LENGTH);

function assertWithinCpuBudget(work: () => unknown): void {
  const started = threadCpuUsage();
  work();
  const { user, system } = threadCpuUsage(started);
  const elapsedMs = (user + system) / 1_000;
  expect(elapsedMs, `${elapsedMs}ms synchronous CPU budget`).toBeLessThan(BUDGET_MS);
}

/** Inputs that made a policy rule backtrack quadratically before its quantifiers were bounded. */
const ADVERSARIAL = {
  'scheme-like word runs': repeated('a-'),
  'dotted word runs': repeated('a.'),
  'repeated database schemes without an @': repeated('redis://a:'),
  'repeated url userinfo without an @': repeated('h://a:'),
  'credential names without an assignment': repeated('token-'),
  'credential names run together': repeated('token'),
  'an unclosed quoted credential': `token:'${repeated('xtoken:')}`,
  'a credential name before endless whitespace': `token${' '.repeat(LENGTH)}`,
  'password words': repeated('password '),
} satisfies Record<string, string>;

describe('every redaction policy stays linear on hostile input', () => {
  const cases = (Object.keys(REDACTION_POLICIES) as RedactionPolicy[]).flatMap((policy) =>
    Object.entries(ADVERSARIAL).map(([name, text]) => [policy, name, text] as const),
  );

  it.each(cases)('%s on %s', (policy, _name, text) => {
    redactWithPolicy(text.slice(0, 1_000), policy);
    assertWithinCpuBudget(() => redactWithPolicy(text, policy));
  });
});

describe('the synchronous CPU budget instrument', () => {
  it('excludes an off-CPU wait longer than the budget', () => {
    const started = performance.now();
    assertWithinCpuBudget(() => {
      expect(Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, BUDGET_MS * 2)).toBe(
        'timed-out',
      );
    });
    expect(performance.now() - started).toBeGreaterThanOrEqual(BUDGET_MS);
  });

  it('rejects the historical unbounded database rule on the same finite input', () => {
    const bounded = SECRET_PATTERN_RULES['database-url-credentials'].pattern;
    const unbounded = new RegExp(bounded.source.replace(/\{\d+,\d+\}/g, '+'), bounded.flags);
    const text = ADVERSARIAL['repeated database schemes without an @'];
    expect(unbounded.source).not.toBe(bounded.source);
    unbounded.test(text.slice(0, 1_000));

    expect(() => assertWithinCpuBudget(() => unbounded.test(text))).toThrow(
      'synchronous CPU budget',
    );
  });
});
