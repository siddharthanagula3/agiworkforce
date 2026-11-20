import { describe, it, expect, vi } from 'vitest';

vi.mock('../logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { getSafeRedirectUrl } from '../safe-redirect';

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

  it('never returns a protocol-relative or backslash path', () => {
    const attacks = [
      `${ORIGIN}//evil.example`,
      `${ORIGIN}//evil.example/login`,
      `${ORIGIN}///evil.example`,
      'https://chat.agiworkforce.com//evil.example/login',
      './/evil.example',
      'x/..//evil.example',
      'x//evil.example',
      `${ORIGIN}/\\evil.example`,
      '/\\evil.example',
      '\\\\evil.example',
      '/\t/evil.example',
      '/.//evil.example',
      '/a/..//evil.example',
      '?\\\\evil.example',
      '#\\\\evil.example',
      '/?/\\evil.example',
      `${ORIGIN}?\\\\evil.example`,
      'https://evil.example?\\\\',
      'https://evil.example#\\@app.agiworkforce.com',
      'https://evil.example?@app.agiworkforce.com\\',
    ];
    for (const attack of attacks) {
      const result = getSafeRedirectUrl(attack, ORIGIN);
      expect(result, attack).toMatch(/^\/(?![/\\])/);
      expect(new URL(result, ORIGIN).origin, attack).toBe(ORIGIN);
    }
  });

  it('collapses repeated slashes into a same-origin path', () => {
    expect(getSafeRedirectUrl('/.//evil.example', ORIGIN)).toBe('/evil.example');
    expect(getSafeRedirectUrl(`${ORIGIN}//a//b?x=1#h`, ORIGIN)).toBe('/a/b?x=1#h');
  });

  it('keeps percent-encoded slashes as a same-origin path', () => {
    const result = getSafeRedirectUrl('/%2F%2Fevil.example', ORIGIN);
    expect(result).toBe('/%2F%2Fevil.example');
    expect(new URL(result, ORIGIN).origin).toBe(ORIGIN);
  });

  it('keeps relative paths on the site', () => {
    expect(getSafeRedirectUrl('dashboard?x=1', ORIGIN)).toBe('/dashboard?x=1');
  });

  it('keeps a backslash that sits in the query or hash', () => {
    const fromSearchParams = new URLSearchParams();
    fromSearchParams.set('redirectTo', '/chat?q=C:\\Users\\x');
    const decoded = fromSearchParams.get('redirectTo');
    expect(decoded).toBe('/chat?q=C:\\Users\\x');
    expect(getSafeRedirectUrl(decoded, ORIGIN)).toBe('/chat?q=C:\\Users\\x');
    expect(getSafeRedirectUrl('/chat?q=a\\b', ORIGIN)).toBe('/chat?q=a\\b');
    expect(getSafeRedirectUrl('/chat#a\\b', ORIGIN)).toBe('/chat#a\\b');
    expect(getSafeRedirectUrl('/chat?q=1#a\\b', ORIGIN)).toBe('/chat?q=1#a\\b');
    expect(getSafeRedirectUrl(`${ORIGIN}/chat?q=a\\b`, ORIGIN)).toBe('/chat?q=a\\b');
    expect(getSafeRedirectUrl('chat?q=a\\b', ORIGIN)).toBe('/chat?q=a\\b');
  });

  it('rejects a backslash before the query or hash', () => {
    expect(getSafeRedirectUrl('/chat\\x?q=1', ORIGIN)).toBe('/');
    expect(getSafeRedirectUrl('/\\evil.example?q=a\\b', ORIGIN)).toBe('/');
    expect(getSafeRedirectUrl('\\\\evil.example#a\\b', ORIGIN)).toBe('/');
    expect(getSafeRedirectUrl(`${ORIGIN}/\\evil.example?q=1`, ORIGIN)).toBe('/');
    expect(getSafeRedirectUrl('https:\\\\evil.example?q=1', ORIGIN)).toBe('/');
  });

  it('rejects a control character anywhere, query and hash included', () => {
    expect(getSafeRedirectUrl('/chat?q=a\nb', ORIGIN)).toBe('/');
    expect(getSafeRedirectUrl('/chat#a\tb', ORIGIN)).toBe('/');
    expect(getSafeRedirectUrl('/chat?q=a\u007fb', ORIGIN)).toBe('/');
    expect(getSafeRedirectUrl('/ch\u0000at', ORIGIN)).toBe('/');
  });
});
