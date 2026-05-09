import { describe, expect, it } from 'vitest';

import { parseRetryAfter, parseRetryAfterFromError } from '../retry-after-internal';

describe('parseRetryAfter', () => {
  it('returns undefined for null/missing headers', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter(undefined)).toBeUndefined();
    expect(parseRetryAfter({})).toBeUndefined();
  });

  it('parses delta-seconds form from a Headers instance', () => {
    const h = new Headers({ 'retry-after': '30' });
    expect(parseRetryAfter(h)).toBe(30);
  });

  it('parses delta-seconds form from a plain object', () => {
    expect(parseRetryAfter({ 'retry-after': '15' })).toBe(15);
    expect(parseRetryAfter({ 'Retry-After': '7' })).toBe(7);
  });

  it('rejects negative / fractional / scientific numerics', () => {
    expect(parseRetryAfter({ 'retry-after': '-5' })).toBeUndefined();
    expect(parseRetryAfter({ 'retry-after': '1.5' })).toBeUndefined();
    expect(parseRetryAfter({ 'retry-after': '1e3' })).toBeUndefined();
  });

  it('parses HTTP-date form, clamping to 0 when in the past', () => {
    const past = new Date(Date.now() - 60_000).toUTCString();
    expect(parseRetryAfter({ 'retry-after': past })).toBe(0);
    const future = new Date(Date.now() + 30_000).toUTCString();
    const v = parseRetryAfter({ 'retry-after': future });
    expect(v).toBeGreaterThan(20);
    expect(v).toBeLessThanOrEqual(31);
  });

  it('returns undefined for unparseable strings', () => {
    expect(parseRetryAfter({ 'retry-after': 'invalid' })).toBeUndefined();
    expect(parseRetryAfter({ 'retry-after': '' })).toBeUndefined();
  });

  it('handles array-valued header objects', () => {
    expect(parseRetryAfter({ 'retry-after': ['12', '99'] })).toBe(12);
  });
});

describe('parseRetryAfterFromError', () => {
  it('reads .headers from an SDK-shaped error', () => {
    const err = { headers: { 'retry-after': '42' } };
    expect(parseRetryAfterFromError(err)).toBe(42);
  });

  it('reads .response.headers when .headers is missing', () => {
    const err = { response: { headers: { 'retry-after': '17' } } };
    expect(parseRetryAfterFromError(err)).toBe(17);
  });

  it('returns undefined for non-objects', () => {
    expect(parseRetryAfterFromError(null)).toBeUndefined();
    expect(parseRetryAfterFromError('boom')).toBeUndefined();
    expect(parseRetryAfterFromError(42)).toBeUndefined();
  });
});
