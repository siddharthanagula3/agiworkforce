import { describe, expect, it } from 'vitest';
import { scrubAttributes, scrubText } from '../text-scrub';

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
