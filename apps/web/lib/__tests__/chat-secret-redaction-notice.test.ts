import { describe, expect, it } from 'vitest';
import {
  SECRET_REDACTION_COUNT_HEADER,
  addSecretRedactionNoticeHeader,
  describeSecretRedactionNotice,
  toSecretRedactionCountHeaderValue,
} from '../chat-secret-redaction-notice';

describe('toSecretRedactionCountHeaderValue', () => {
  it('returns null when no secrets were redacted', () => {
    expect(toSecretRedactionCountHeaderValue(undefined)).toBeNull();
    expect(toSecretRedactionCountHeaderValue(0)).toBeNull();
    expect(toSecretRedactionCountHeaderValue(-1)).toBeNull();
  });

  it('stringifies a positive count', () => {
    expect(toSecretRedactionCountHeaderValue(2)).toBe('2');
  });

  it('caps an unreasonably large count for header safety', () => {
    expect(toSecretRedactionCountHeaderValue(10_000)).toBe('999');
  });
});

describe('addSecretRedactionNoticeHeader', () => {
  it('adds the header when a count is present', () => {
    const headers: Record<string, string> = {};
    addSecretRedactionNoticeHeader(headers, { secretRedactionCount: 3 });
    expect(headers[SECRET_REDACTION_COUNT_HEADER]).toBe('3');
  });

  it('leaves headers untouched when nothing was redacted', () => {
    const headers: Record<string, string> = {};
    addSecretRedactionNoticeHeader(headers, {});
    expect(headers).toEqual({});
  });
});

describe('describeSecretRedactionNotice', () => {
  it('pluralizes for counts other than one', () => {
    expect(describeSecretRedactionNotice(1)).toBe(
      '1 secret was removed from this message before it was sent.',
    );
    expect(describeSecretRedactionNotice(2)).toBe(
      '2 secrets were removed from this message before it was sent.',
    );
  });

  it('accepts a string count from a response header', () => {
    expect(describeSecretRedactionNotice('4')).toBe(
      '4 secrets were removed from this message before it was sent.',
    );
  });

  it('returns null for an absent, zero, or invalid count', () => {
    expect(describeSecretRedactionNotice(undefined)).toBeNull();
    expect(describeSecretRedactionNotice(null)).toBeNull();
    expect(describeSecretRedactionNotice(0)).toBeNull();
    expect(describeSecretRedactionNotice('not-a-number')).toBeNull();
  });
});
