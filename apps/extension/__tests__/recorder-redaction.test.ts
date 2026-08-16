
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';

const REC_REDACTION_PATTERNS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/g, replacement: '[REDACTED_ANTHROPIC_KEY]' },
  { pattern: /sk-[a-zA-Z0-9_-]{20,}/g, replacement: '[REDACTED_API_KEY]' },
  { pattern: /AIzaSy[a-zA-Z0-9_-]{33}/g, replacement: '[REDACTED_GOOGLE_KEY]' },
  { pattern: /AKIA[A-Z0-9]{16}/g, replacement: '[REDACTED_AWS_KEY]' },
  { pattern: /gh[ps]_[a-zA-Z0-9]{36,}/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  {
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    replacement: '[REDACTED_JWT]',
  },
];

function sanitizeRecordedValue(
  target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): string | null {
  if (target instanceof HTMLInputElement && target.type === 'password') {
    return null;
  }
  const autocomplete = (target.getAttribute('autocomplete') ?? '').toLowerCase();
  if (
    /^cc-/.test(autocomplete) ||
    autocomplete === 'current-password' ||
    autocomplete === 'new-password' ||
    autocomplete === 'one-time-code'
  ) {
    return '[REDACTED]';
  }
  let value = target.value ?? '';
  for (const { pattern, replacement } of REC_REDACTION_PATTERNS) {
    value = value.replace(pattern, replacement);
  }
  return value;
}

function makeInput(opts: {
  type?: string;
  autocomplete?: string;
  value?: string;
}): HTMLInputElement {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const doc = dom.window.document;
  (globalThis as { HTMLInputElement?: typeof HTMLInputElement }).HTMLInputElement =
    dom.window.HTMLInputElement;
  (globalThis as { HTMLTextAreaElement?: typeof HTMLTextAreaElement }).HTMLTextAreaElement =
    dom.window.HTMLTextAreaElement;
  (globalThis as { HTMLSelectElement?: typeof HTMLSelectElement }).HTMLSelectElement =
    dom.window.HTMLSelectElement;
  const input = doc.createElement('input');
  if (opts.type) input.type = opts.type;
  if (opts.autocomplete) input.setAttribute('autocomplete', opts.autocomplete);
  if (opts.value !== undefined) input.value = opts.value;
  return input as unknown as HTMLInputElement;
}

describe('C-05 recorder value sanitization', () => {
  describe('password fields are dropped entirely', () => {
    it('returns null for <input type="password">', () => {
      const input = makeInput({ type: 'password', value: 'hunter2' });
      expect(sanitizeRecordedValue(input)).toBeNull();
    });

    it('returns null even when password field has autocomplete', () => {
      const input = makeInput({ type: 'password', autocomplete: 'new-password', value: 'x' });
      expect(sanitizeRecordedValue(input)).toBeNull();
    });
  });

  describe('autocomplete-tagged sensitive fields are redacted to placeholder', () => {
    it('redacts cc-number', () => {
      const input = makeInput({ autocomplete: 'cc-number', value: '4111111111111111' });
      expect(sanitizeRecordedValue(input)).toBe('[REDACTED]');
    });

    it('redacts cc-csc', () => {
      const input = makeInput({ autocomplete: 'cc-csc', value: '123' });
      expect(sanitizeRecordedValue(input)).toBe('[REDACTED]');
    });

    it('redacts cc-exp-month', () => {
      const input = makeInput({ autocomplete: 'cc-exp-month', value: '12' });
      expect(sanitizeRecordedValue(input)).toBe('[REDACTED]');
    });

    it('redacts current-password', () => {
      const input = makeInput({ autocomplete: 'current-password', value: 'secret' });
      expect(sanitizeRecordedValue(input)).toBe('[REDACTED]');
    });

    it('redacts new-password', () => {
      const input = makeInput({ autocomplete: 'new-password', value: 'secret' });
      expect(sanitizeRecordedValue(input)).toBe('[REDACTED]');
    });

    it('redacts one-time-code', () => {
      const input = makeInput({ autocomplete: 'one-time-code', value: '482931' });
      expect(sanitizeRecordedValue(input)).toBe('[REDACTED]');
    });

    it('handles autocomplete in upper case', () => {
      const input = makeInput({ autocomplete: 'CURRENT-PASSWORD', value: 'x' });
      expect(sanitizeRecordedValue(input)).toBe('[REDACTED]');
    });
  });

  describe('secret-shaped substrings are redacted inline', () => {
    it('redacts an Anthropic API key', () => {
      const input = makeInput({
        value: 'My key is sk-ant-abcdefghijklmnopqrstuv',
      });
      const out = sanitizeRecordedValue(input);
      expect(out).toContain('[REDACTED_ANTHROPIC_KEY]');
      expect(out).not.toContain('sk-ant-abcdefghijklmnopqrstuv');
    });

    it('redacts a generic sk-* API key', () => {
      const input = makeInput({ value: 'sk-abcdefghijklmnopqrst1234' });
      const out = sanitizeRecordedValue(input);
      expect(out).toContain('[REDACTED_API_KEY]');
    });

    it('redacts an AWS access key', () => {
      const input = makeInput({ value: 'AKIAIOSFODNN7EXAMPLE' });
      expect(sanitizeRecordedValue(input)).toBe('[REDACTED_AWS_KEY]');
    });

    it('redacts a JWT', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.aaaaaaaaaaaaa';
      const input = makeInput({ value: `Bearer ${jwt}` });
      const out = sanitizeRecordedValue(input);
      expect(out).toContain('[REDACTED_JWT]');
      expect(out).not.toContain(jwt);
    });

    it('redacts a GitHub PAT', () => {
      const input = makeInput({ value: 'ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL' });
      expect(sanitizeRecordedValue(input)).toBe('[REDACTED_GITHUB_TOKEN]');
    });

    it('leaves benign text unchanged', () => {
      const input = makeInput({ value: 'Hello, world!' });
      expect(sanitizeRecordedValue(input)).toBe('Hello, world!');
    });
  });

  describe('empty / null cases', () => {
    it('returns empty string when value is empty', () => {
      const input = makeInput({ value: '' });
      expect(sanitizeRecordedValue(input)).toBe('');
    });
  });
});
