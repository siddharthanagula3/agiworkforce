import { describe, expect, it } from 'vitest';
import { scrubAttributes, scrubText } from '../text-scrub';

const MAX_LENGTH = 256;
const TRUNCATION = '…';
const ADVERSARIAL_SEEDS = ['%', 'token'] as const;
const ADVERSARIAL_LENGTH = 150_000;
const ADVERSARIAL_BUDGET_MS = 1_000;

describe('scrubText', () => {
  it('redacts a path, a url and a token shape in one message', () => {
    const message =
      'failed reading /Users/alice/secrets/notes.txt via https://internal.example.com/accounts/42 using sk-live-0123456789abcdef';
    const result = scrubText(message);
    expect(result).not.toContain('/Users/alice');
    expect(result).not.toContain('notes.txt');
    expect(result).not.toMatch(/https?:\/\//);
    expect(result).not.toContain('sk-live');
    expect(result).toContain('[redacted]');
  });

  it('redacts an email address', () => {
    expect(scrubText('contact user@example.com for access')).not.toContain('user@example.com');
  });

  it('leaves ordinary text untouched', () => {
    expect(scrubText('primary route selected')).toBe('primary route selected');
  });

  it('truncates an overlong message', () => {
    const result = scrubText('a'.repeat(400));
    expect(result.length).toBeLessThan(400);
    expect(result.endsWith('…')).toBe(true);
  });

  it('returns promptly on runs that used to backtrack polynomially', () => {
    for (const seed of ADVERSARIAL_SEEDS) {
      const input = seed.repeat(Math.ceil(ADVERSARIAL_LENGTH / seed.length));
      const started = Date.now();
      const result = scrubText(input);
      expect(Date.now() - started).toBeLessThan(ADVERSARIAL_BUDGET_MS);
      expect(result).toBe(`${input.slice(0, MAX_LENGTH)}${TRUNCATION}`);
    }
  });

  it('still redacts a realistic secret that follows a long benign run', () => {
    const input = `${'token'.repeat(20)} sk-live-0123456789abcdef`;
    expect(scrubText(input)).toBe(`${'token'.repeat(20)} [redacted]`);
  });
});

describe('scrubAttributes', () => {
  it('scrubs string values while passing numbers and booleans through', () => {
    const result = scrubAttributes({
      detail: 'token at sk-live-0123456789abcdef',
      count: 3,
      ready: true,
    });
    expect(result['detail']).toBe('token at [redacted]');
    expect(result['count']).toBe(3);
    expect(result['ready']).toBe(true);
  });

  it('drops null, undefined and non-finite values', () => {
    const result = scrubAttributes({
      a: null,
      b: undefined,
      c: Number.NaN,
      d: 'kept',
    });
    expect(result).toEqual({ d: 'kept' });
  });
});
