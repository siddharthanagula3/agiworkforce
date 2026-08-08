import { describe, expect, it } from 'vitest';

import { validateEmail, validateSqlQuery, checkForInjection } from '../validation';

/**
 * These three functions had their regexes replaced with linear equivalents to
 * clear `js/polynomial-redos`. The risk of that kind of change is a silent
 * behaviour drift, so each case below is checked against the ORIGINAL
 * expression rather than against my belief about what it did.
 */
const LEGACY_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LEGACY_DELETE_WHERE = /DELETE\s+FROM\s+.*\s+WHERE\s+1\s*=\s*1/i;

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
    // No dot in the domain, so the old expression retried every split point.
    expect(validateEmail(`a@${'b'.repeat(100_000)}`)).toBe(false);
  });
});

describe('validateSqlQuery linear rewrite', () => {
  it('still rejects the DELETE ... WHERE 1=1 shape the expression targeted', () => {
    const dangerous = 'DELETE FROM users WHERE 1 = 1';
    expect(LEGACY_DELETE_WHERE.test(dangerous)).toBe(true);
    expect(validateSqlQuery(dangerous).valid).toBe(false);
  });

  it('still accepts ordinary queries', () => {
    expect(validateSqlQuery('SELECT * FROM users').valid).toBe(true);
    expect(validateSqlQuery('DELETE FROM users WHERE id = 42').valid).toBe(true);
  });

  it('matches strictly more than the original, never less', () => {
    // The two halves no longer have to appear in order. That is the safe
    // direction for a denylist, and it is recorded here so the widening is a
    // decision rather than an accident.
    const reordered = 'WHERE 1=1 -- DELETE FROM audit';
    expect(LEGACY_DELETE_WHERE.test(reordered)).toBe(false);
    expect(validateSqlQuery(reordered).valid).toBe(false);
  });

  it('answers immediately on the input that made the old expression quadratic', () => {
    expect(validateSqlQuery(`DELETE FROM ${'a '.repeat(50_000)}`).valid).toBe(true);
  });
});

describe('checkForInjection svg rule linear rewrite', () => {
  it('still flags an svg carrying an event handler', () => {
    // No parentheses in the payload: the command-injection rule /[;&|`$()]/
    // runs BEFORE the XSS loop and would answer 'Command Injection' first.
    // That ordering is pre-existing and untouched here; the point of this
    // test is the svg rule, so the input has to reach it.
    expect(checkForInjection('<svg onload=x>')).toMatchObject({ safe: false, type: 'XSS' });
  });

  it('does not newly flag a plain svg with no handler', () => {
    // Testing for the tag alone would have regressed here.
    expect(checkForInjection('<svg width="10" height="10">').safe).toBe(true);
  });

  it('answers immediately on a long unclosed svg tag', () => {
    expect(checkForInjection(`<svg ${'a'.repeat(100_000)}`).safe).toBe(true);
  });
});
