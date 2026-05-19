import { describe, it, expect } from 'vitest';

import {
  secureToken,
  secureTokenHex,
  secureFilenameSegment,
  secureRandomFloat,
  secureRandomInt,
  isSecureRandomAvailable,
  SecureRandomUnavailableError,
} from '../secure-random';

describe('secureToken', () => {
  it('returns a base64url-charset string', () => {
    expect(secureToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('default 18 bytes → 24 chars', () => {
    expect(secureToken()).toHaveLength(24);
  });

  it('24 bytes → 32 chars (matches /api/share token format)', () => {
    expect(secureToken(24)).toHaveLength(32);
  });

  it('1 byte → 2 chars (sanity)', () => {
    expect(secureToken(1)).toHaveLength(2);
  });

  it('produces unique values across 1000 calls', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(secureToken());
    expect(set.size).toBe(1000);
  });

  it('rejects invalid byteLength', () => {
    expect(() => secureToken(0)).toThrow(RangeError);
    expect(() => secureToken(-1)).toThrow(RangeError);
    expect(() => secureToken(1.5)).toThrow(RangeError);
    expect(() => secureToken(70_000)).toThrow(RangeError);
  });
});

describe('secureTokenHex', () => {
  it('returns a hex-charset string', () => {
    expect(secureTokenHex()).toMatch(/^[0-9a-f]+$/);
  });

  it('default 16 bytes → 32 hex chars', () => {
    expect(secureTokenHex()).toHaveLength(32);
  });

  it('produces unique values across 1000 calls', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(secureTokenHex());
    expect(set.size).toBe(1000);
  });
});

describe('secureFilenameSegment', () => {
  it('returns a [a-z0-9] segment', () => {
    expect(secureFilenameSegment()).toMatch(/^[a-z0-9]+$/);
  });

  it('default length 13', () => {
    expect(secureFilenameSegment()).toHaveLength(13);
  });

  it('honors custom length', () => {
    expect(secureFilenameSegment(20)).toHaveLength(20);
    expect(secureFilenameSegment(1)).toHaveLength(1);
    expect(secureFilenameSegment(64)).toHaveLength(64);
  });

  it('1000 calls produce overwhelmingly unique values', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(secureFilenameSegment());
    // Birthday-paradox tolerance: 13 chars × 36 alphabet ≈ 4.7e20 space
    expect(set.size).toBeGreaterThan(995);
  });

  it('rejects invalid length', () => {
    expect(() => secureFilenameSegment(0)).toThrow(RangeError);
    expect(() => secureFilenameSegment(-3)).toThrow(RangeError);
    expect(() => secureFilenameSegment(2.5)).toThrow(RangeError);
  });
});

describe('secureRandomFloat', () => {
  it('returns value in [0, 1)', () => {
    for (let i = 0; i < 1000; i++) {
      const v = secureRandomFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('produces a range of values (not stuck at constant)', () => {
    const set = new Set<number>();
    for (let i = 0; i < 100; i++) set.add(secureRandomFloat());
    expect(set.size).toBeGreaterThan(95);
  });
});

describe('secureRandomInt', () => {
  it('returns value in [0, max)', () => {
    for (let i = 0; i < 100; i++) {
      const v = secureRandomInt(10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
    }
  });

  it('maxExclusive = 1 returns 0', () => {
    for (let i = 0; i < 50; i++) expect(secureRandomInt(1)).toBe(0);
  });

  it('rejects invalid maxExclusive', () => {
    expect(() => secureRandomInt(0)).toThrow(RangeError);
    expect(() => secureRandomInt(-5)).toThrow(RangeError);
    expect(() => secureRandomInt(1.5)).toThrow(RangeError);
  });

  it('distribution across 10k samples is reasonably uniform for n=10', () => {
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 10_000; i++) counts[secureRandomInt(10)]++;
    // Each bucket should be ~1000 ± 250 — generous tolerance for CI flake margin
    for (const c of counts) {
      expect(c).toBeGreaterThan(700);
      expect(c).toBeLessThan(1300);
    }
  });
});

describe('isSecureRandomAvailable', () => {
  it('returns true in the test runtime (Node ≥ 19 / jsdom)', () => {
    expect(isSecureRandomAvailable()).toBe(true);
  });
});

describe('SecureRandomUnavailableError', () => {
  it('is an Error subclass with the right name', () => {
    const err = new SecureRandomUnavailableError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('SecureRandomUnavailableError');
    expect(err.message).toContain('Cryptographically secure RNG');
  });
});
