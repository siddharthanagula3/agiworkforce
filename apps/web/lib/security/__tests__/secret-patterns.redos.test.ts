import { describe, expect, it } from 'vitest';

import { SECRET_PATTERN_REGISTRY } from '../secret-patterns';
import { scanForSecrets } from '../secrets-audit';

/**
 * Each of these is an input shaped to make one pattern backtrack: a long run of
 * the pattern's own prefix with the literal that would end the match never
 * arriving. Before the quantifiers were bounded, the JWT, Postgres and MongoDB
 * patterns scanned to end of input from every start position, so a single
 * unauthenticated request could hold a worker for tens of seconds.
 *
 * The budget is generous on purpose. It is not a performance target, it is the
 * line between "slow request" and "the instance stops answering".
 */
const ONE_MEGABYTE = 1024 * 1024;
const SCAN_BUDGET_MS = 2_000;

function repeatTo(fragment: string, length: number): string {
  return fragment.repeat(Math.ceil(length / fragment.length)).slice(0, length);
}

const ADVERSARIAL_INPUTS: ReadonlyArray<{ name: string; build: () => string }> = [
  { name: 'a run of JWT prefixes with no dot', build: () => repeatTo('eyJ', ONE_MEGABYTE) },
  {
    name: 'a postgres url whose password never ends in an at sign',
    build: () => `postgres://${repeatTo('a', ONE_MEGABYTE / 2)}:${repeatTo('b', ONE_MEGABYTE / 2)}`,
  },
  {
    name: 'a mongodb url whose password never ends in an at sign',
    build: () => `mongodb://${repeatTo('a', ONE_MEGABYTE / 2)}:${repeatTo('b', ONE_MEGABYTE / 2)}`,
  },
  { name: 'a run of api_key assignments', build: () => repeatTo('api_key=a', ONE_MEGABYTE) },
  { name: 'a run of secret assignments', build: () => repeatTo('secret=a', ONE_MEGABYTE) },
  { name: 'a run of bearer prefixes', build: () => repeatTo('Bearer  ', ONE_MEGABYTE) },
];

describe('the secret registry stays bounded on input shaped to make it backtrack', () => {
  for (const { name, build } of ADVERSARIAL_INPUTS) {
    it(`scans ${name} within the budget`, () => {
      const input = build();

      const started = Date.now();
      scanForSecrets(input);
      const elapsed = Date.now() - started;

      expect(elapsed, `${name} took ${elapsed}ms`).toBeLessThan(SCAN_BUDGET_MS);
    });
  }

  // The dangerous shape is two open-ended runs with a required literal between
  // them: the first run is rescanned from every failed start. A single
  // open-ended run with nothing required after it is linear and is left alone.
  it.each(['JWT', 'Database URL with Credentials', 'MongoDB URL with Credentials'])(
    'keeps an upper bound on both runs of the %s pattern',
    (name) => {
      const entry = SECRET_PATTERN_REGISTRY.find((candidate) => candidate.name === name);

      expect(entry, `${name} has left the registry; move this case with it`).toBeDefined();
      expect(entry!.pattern.source).not.toMatch(/\{\d+,\}/);
    },
  );
});

describe('the bounds still match the credentials they are there to catch', () => {
  it('matches a realistically sized JWT', () => {
    const jwt = `eyJ${'a'.repeat(36)}.${'b'.repeat(900)}.${'c'.repeat(43)}`;

    expect(scanForSecrets(jwt).map((entry) => entry.name)).toContain('JWT');
  });

  it('matches a postgres url carrying credentials', () => {
    const url = 'postgres://app_user:s3cr3t-password@db.example.com/appdb';

    expect(scanForSecrets(url).map((entry) => entry.name)).toContain(
      'Database URL with Credentials',
    );
  });

  it('matches a mongodb url carrying credentials', () => {
    const url = 'mongodb+srv://app_user:s3cr3t-password@cluster0.example.net/appdb';

    expect(scanForSecrets(url).map((entry) => entry.name)).toContain(
      'MongoDB URL with Credentials',
    );
  });

  it('leaves an ordinary url alone', () => {
    expect(scanForSecrets('postgres://db.example.com/appdb')).toEqual([]);
  });
});
