/**
 * P1-4: parseRetryAfter — RFC 7231 §7.1.3 conformance.
 *
 * Adapters parse the upstream `Retry-After` header on 429/503 responses
 * and surface the suggested wait via `StreamChunkError.retryAfterSeconds`.
 * The header may be either a delta-seconds integer or an HTTP-date.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseRetryAfter, parseRetryAfterFromError } from '../retry-after';

describe('parseRetryAfter — delta-seconds form', () => {
  it('parses an integer-second value', () => {
    const h = new Headers({ 'Retry-After': '30' });
    expect(parseRetryAfter(h)).toBe(30);
  });

  it('parses 0 (legal: retry immediately)', () => {
    expect(parseRetryAfter(new Headers({ 'Retry-After': '0' }))).toBe(0);
  });

  it('returns undefined for fractional values (RFC requires integer)', () => {
    expect(parseRetryAfter(new Headers({ 'Retry-After': '3.5' }))).toBeUndefined();
  });

  it('returns undefined for negative values', () => {
    // Regex rejects the leading minus sign; falls through to Date.parse(),
    // which fails too — undefined is the correct outcome.
    expect(parseRetryAfter(new Headers({ 'Retry-After': '-5' }))).toBeUndefined();
  });
});

describe('parseRetryAfter — HTTP-date form', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('parses an HTTP-date 30s in the future as ~30 seconds', () => {
    const h = new Headers({ 'Retry-After': 'Fri, 08 May 2026 12:00:30 GMT' });
    const v = parseRetryAfter(h);
    expect(v).toBeGreaterThanOrEqual(29);
    expect(v).toBeLessThanOrEqual(30);
  });

  it('clamps a past HTTP-date to 0', () => {
    const h = new Headers({ 'Retry-After': 'Fri, 08 May 2026 11:00:00 GMT' });
    expect(parseRetryAfter(h)).toBe(0);
  });

  it('returns undefined for a malformed HTTP-date', () => {
    expect(parseRetryAfter(new Headers({ 'Retry-After': 'tomorrow' }))).toBeUndefined();
  });
});

describe('parseRetryAfter — input shape variants', () => {
  it('accepts a Headers instance', () => {
    expect(parseRetryAfter(new Headers({ 'Retry-After': '5' }))).toBe(5);
  });

  it('accepts a plain object (older SDK error shapes)', () => {
    expect(parseRetryAfter({ 'retry-after': '7' })).toBe(7);
  });

  it('accepts an array-of-string value', () => {
    expect(parseRetryAfter({ 'retry-after': ['11', '22'] })).toBe(11);
  });

  it('returns undefined when the header is missing', () => {
    expect(parseRetryAfter(new Headers())).toBeUndefined();
    expect(parseRetryAfter({})).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter(undefined)).toBeUndefined();
  });
});

describe('parseRetryAfterFromError', () => {
  it('reads err.headers (modern SDK)', () => {
    const err = { headers: new Headers({ 'Retry-After': '13' }), status: 429 };
    expect(parseRetryAfterFromError(err)).toBe(13);
  });

  it('reads err.response.headers (older shape)', () => {
    const err = { response: { headers: { 'retry-after': '17' } }, status: 429 };
    expect(parseRetryAfterFromError(err)).toBe(17);
  });

  it('returns undefined for non-object errors', () => {
    expect(parseRetryAfterFromError(undefined)).toBeUndefined();
    expect(parseRetryAfterFromError(null)).toBeUndefined();
    expect(parseRetryAfterFromError('string error')).toBeUndefined();
    expect(parseRetryAfterFromError(429)).toBeUndefined();
  });
});
