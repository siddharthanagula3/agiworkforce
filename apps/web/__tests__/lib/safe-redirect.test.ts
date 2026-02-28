/**
 * Safe Redirect Tests
 *
 * Tests for open redirect prevention utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { getSafeRedirectUrl, isRedirectSafe } from '@/lib/safe-redirect';

describe('Safe Redirect', () => {
  const origin = 'https://example.com';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSafeRedirectUrl', () => {
    describe('Relative Paths', () => {
      it('should allow simple relative paths', () => {
        expect(getSafeRedirectUrl('/dashboard', origin)).toBe('/dashboard');
        expect(getSafeRedirectUrl('/settings/profile', origin)).toBe('/settings/profile');
      });

      it('should allow paths with query strings', () => {
        expect(getSafeRedirectUrl('/search?q=test', origin)).toBe('/search?q=test');
      });

      it('should allow paths with hash fragments', () => {
        expect(getSafeRedirectUrl('/docs#section1', origin)).toBe('/docs#section1');
      });

      it('should normalize multiple slashes', () => {
        expect(getSafeRedirectUrl('//example.com', origin)).toBe('/');
        expect(getSafeRedirectUrl('/foo//bar///baz', origin)).toBe('/foo/bar/baz');
      });
    });

    describe('Same-Origin URLs', () => {
      it('should allow same-origin absolute URLs', () => {
        const result = getSafeRedirectUrl('https://example.com/dashboard', origin);
        expect(result).toBe('/dashboard');
      });

      it('should extract pathname from same-origin URLs', () => {
        const result = getSafeRedirectUrl('https://example.com/path?query=1#hash', origin);
        expect(result).toBe('/path?query=1#hash');
      });
    });

    describe('Protocol-Relative URLs', () => {
      it('should block protocol-relative URLs (//evil.com)', () => {
        expect(getSafeRedirectUrl('//evil.com/path', origin)).toBe('/');
      });

      it('should block protocol-relative with credentials', () => {
        expect(getSafeRedirectUrl('//user:pass@evil.com', origin)).toBe('/');
      });
    });

    describe('Dangerous Protocols', () => {
      it('should block javascript: protocol', () => {
        expect(getSafeRedirectUrl('javascript:alert(1)', origin)).toBe('/');
        expect(getSafeRedirectUrl('JAVASCRIPT:alert(1)', origin)).toBe('/');
        expect(getSafeRedirectUrl('JavaScript:alert(1)', origin)).toBe('/');
      });

      it('should block data: protocol', () => {
        expect(getSafeRedirectUrl('data:text/html,<script>alert(1)</script>', origin)).toBe('/');
        expect(getSafeRedirectUrl('DATA:text/html,test', origin)).toBe('/');
      });

      it('should block vbscript: protocol', () => {
        expect(getSafeRedirectUrl('vbscript:msgbox(1)', origin)).toBe('/');
        expect(getSafeRedirectUrl('VBSCRIPT:test', origin)).toBe('/');
      });
    });

    describe('Cross-Origin URLs', () => {
      it('should block cross-origin URLs', () => {
        expect(getSafeRedirectUrl('https://evil.com/path', origin)).toBe('/');
        expect(getSafeRedirectUrl('http://attacker.com', origin)).toBe('/');
      });

      it('should block different subdomain', () => {
        expect(getSafeRedirectUrl('https://sub.example.com/path', origin)).toBe('/');
      });

      it('should block different port', () => {
        expect(getSafeRedirectUrl('https://example.com:8080/path', origin)).toBe('/');
      });
    });

    describe('Null/Empty/Whitespace', () => {
      it('should return fallback for null', () => {
        expect(getSafeRedirectUrl(null, origin)).toBe('/');
      });

      it('should return fallback for undefined', () => {
        expect(getSafeRedirectUrl(undefined, origin)).toBe('/');
      });

      it('should return fallback for empty string', () => {
        expect(getSafeRedirectUrl('', origin)).toBe('/');
      });

      it('should return fallback for whitespace only', () => {
        expect(getSafeRedirectUrl('   ', origin)).toBe('/');
      });

      it('should trim whitespace from valid URLs', () => {
        expect(getSafeRedirectUrl('  /dashboard  ', origin)).toBe('/dashboard');
      });
    });

    describe('Custom Fallback', () => {
      it('should use custom fallback when specified', () => {
        expect(getSafeRedirectUrl(null, origin, '/home')).toBe('/home');
        expect(getSafeRedirectUrl('https://evil.com', origin, '/error')).toBe('/error');
      });
    });

    describe('URL Parsing Behavior', () => {
      it('should handle colon-prefixed URLs', () => {
        // '://invalid' is parsed relative to origin, becoming a same-origin path
        const result = getSafeRedirectUrl('://invalid', origin);
        // The URL is parsed and normalized - exact result depends on URL parsing
        expect(result.startsWith('/')).toBe(true);
      });

      it('should handle space-containing URLs as relative paths', () => {
        // 'not a url at all' is parsed as relative path when used with origin base
        // The URL constructor treats it relative to origin
        const result = getSafeRedirectUrl('not a url at all', origin);
        // This becomes a relative path
        expect(result.startsWith('/')).toBe(true);
      });
    });

    describe('Edge Cases', () => {
      it('should handle URL-encoded characters', () => {
        const result = getSafeRedirectUrl('/path%20with%20spaces', origin);
        expect(result).toBe('/path%20with%20spaces');
      });

      it('should handle unicode in path', () => {
        const result = getSafeRedirectUrl('/path/日本語', origin);
        // The URL constructor encodes non-ASCII characters in the pathname
        expect(result).toBe('/path/%E6%97%A5%E6%9C%AC%E8%AA%9E');
      });
    });
  });

  describe('isRedirectSafe', () => {
    describe('Safe URLs', () => {
      it('should return true for relative paths', () => {
        expect(isRedirectSafe('/dashboard', origin)).toBe(true);
        expect(isRedirectSafe('/settings', origin)).toBe(true);
      });

      it('should return true for same-origin URLs', () => {
        expect(isRedirectSafe('https://example.com/path', origin)).toBe(true);
      });
    });

    describe('Unsafe URLs', () => {
      it('should return false for null/undefined', () => {
        expect(isRedirectSafe(null, origin)).toBe(false);
        expect(isRedirectSafe(undefined, origin)).toBe(false);
      });

      it('should return false for protocol-relative URLs', () => {
        expect(isRedirectSafe('//evil.com', origin)).toBe(false);
      });

      it('should return false for dangerous protocols', () => {
        expect(isRedirectSafe('javascript:alert(1)', origin)).toBe(false);
        expect(isRedirectSafe('data:text/html,test', origin)).toBe(false);
        expect(isRedirectSafe('vbscript:test', origin)).toBe(false);
      });

      it('should return false for cross-origin URLs', () => {
        expect(isRedirectSafe('https://evil.com', origin)).toBe(false);
        expect(isRedirectSafe('http://attacker.com/path', origin)).toBe(false);
      });

      it('should not return a cross-origin URL for space-prefixed absolute URL (M29)', () => {
        // "https://evil.com some path" — ensure implementation does not return an evil.com URL
        const result = getSafeRedirectUrl('https://evil.com some path', origin);
        // Use URL constructor for proper origin comparison instead of startsWith
        // to avoid CodeQL js/incomplete-url-substring-sanitization (startsWith would
        // also match 'https://evil.com.attacker.com').
        const parsed = (() => {
          try {
            return new URL(result);
          } catch {
            return null;
          }
        })();
        if (parsed) {
          expect(parsed.origin).not.toBe('https://evil.com');
          expect(parsed.origin).not.toBe('http://evil.com');
        }
        // If result is a relative URL (no origin), it is safe (same-origin by definition).
      });

      it('should handle space-containing text as same-origin path', () => {
        // Text with spaces gets parsed as relative URL by URL constructor with base
        // This makes it a same-origin path, which is considered safe
        expect(isRedirectSafe('not a valid url', origin)).toBe(true);
      });
    });
  });
});
