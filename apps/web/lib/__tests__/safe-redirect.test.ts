import { describe, it, expect, vi } from 'vitest';

vi.mock('../logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { getSafeRedirectUrl, isRedirectSafe } from '../safe-redirect';

const ORIGIN = 'https://app.agiworkforce.com';

describe('getSafeRedirectUrl', () => {
  it('returns fallback for null/undefined/empty', () => {
    expect(getSafeRedirectUrl(null, ORIGIN)).toBe('/');
    expect(getSafeRedirectUrl(undefined, ORIGIN)).toBe('/');
    expect(getSafeRedirectUrl('', ORIGIN)).toBe('/');
    expect(getSafeRedirectUrl('   ', ORIGIN)).toBe('/');
  });

  it('allows relative paths', () => {
    expect(getSafeRedirectUrl('/dashboard', ORIGIN)).toBe('/dashboard');
    expect(getSafeRedirectUrl('/settings?tab=billing', ORIGIN)).toBe('/settings?tab=billing');
    expect(getSafeRedirectUrl('/chat#section', ORIGIN)).toBe('/chat#section');
  });

  it('blocks protocol-relative URLs', () => {
    expect(getSafeRedirectUrl('//evil.com/steal', ORIGIN)).toBe('/');
  });

  it('blocks javascript: URLs', () => {
    expect(getSafeRedirectUrl('javascript:alert(1)', ORIGIN)).toBe('/');
    expect(getSafeRedirectUrl('JAVASCRIPT:alert(1)', ORIGIN)).toBe('/');
  });

  it('blocks data: URLs', () => {
    expect(getSafeRedirectUrl('data:text/html,<script>alert(1)</script>', ORIGIN)).toBe('/');
  });

  it('blocks vbscript: URLs', () => {
    expect(getSafeRedirectUrl('vbscript:msgbox', ORIGIN)).toBe('/');
  });

  it('blocks cross-origin redirects', () => {
    expect(getSafeRedirectUrl('https://evil.com/steal', ORIGIN)).toBe('/');
    expect(getSafeRedirectUrl('https://phishing.com', ORIGIN)).toBe('/');
  });

  it('allows same-origin absolute URLs', () => {
    const result = getSafeRedirectUrl('https://app.agiworkforce.com/dashboard', ORIGIN);
    expect(result).toBe('/dashboard');
  });

  it('allows allowed hosts', () => {
    const result = getSafeRedirectUrl('https://chat.agiworkforce.com/room/123', ORIGIN);
    expect(result).toBe('/room/123');
  });

  it('normalizes double slashes in paths', () => {
    const result = getSafeRedirectUrl('///../etc/passwd', ORIGIN);
    expect(result).toBe('/');
  });

  it('uses custom fallback', () => {
    expect(getSafeRedirectUrl(null, ORIGIN, '/home')).toBe('/home');
  });
});

describe('isRedirectSafe', () => {
  it('returns false for null/undefined', () => {
    expect(isRedirectSafe(null, ORIGIN)).toBe(false);
    expect(isRedirectSafe(undefined, ORIGIN)).toBe(false);
  });

  it('returns true for relative paths', () => {
    expect(isRedirectSafe('/dashboard', ORIGIN)).toBe(true);
  });

  it('returns false for protocol-relative URLs', () => {
    expect(isRedirectSafe('//evil.com', ORIGIN)).toBe(false);
  });

  it('returns false for javascript: URLs', () => {
    expect(isRedirectSafe('javascript:void(0)', ORIGIN)).toBe(false);
  });

  it('returns false for cross-origin', () => {
    expect(isRedirectSafe('https://evil.com', ORIGIN)).toBe(false);
  });
});
