import { describe, expect, it } from 'vitest';

import { validateEmail } from '../validation';

const LEGACY_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

describe('validateEmail linear rewrite', () => {
  const cases = [
    'user@example.com',
    'user.name+tag@sub.example.co.uk',
    'a@b.c',
    'user@example',
    'user@.com',
    'user@com.',
    '@example.com',
    'user@',
    'user example@test.com',
    'user@exa mple.com',
    'user@@example.com',
    'user@a.b@c.d',
    '',
    '@',
    '.@.',
    'user\t@example.com',
    'user@example.com\n',
  ];

  it('agrees with the expression it replaced on every case', () => {
    for (const input of cases) {
      expect(validateEmail(input), input).toBe(LEGACY_EMAIL.test(input));
    }
  });

  it('answers immediately on the input that made the old expression quadratic', () => {
    expect(validateEmail(`a@${'b'.repeat(100_000)}`)).toBe(false);
  });
});
