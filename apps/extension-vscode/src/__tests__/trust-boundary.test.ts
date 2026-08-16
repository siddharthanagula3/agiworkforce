
import { describe, it, expect } from 'vitest';

import { TIER_ORDER, tierAtLeast } from '../integrations/tierResolver';

describe('tier resolver ordering', () => {
  it('local is the lowest tier', () => {
    expect(TIER_ORDER[0]).toBe('local');
  });

  it('byok is the default fallback tier (safe under-gate)', () => {
    const DEFAULT_TIER = 'byok';
    expect(TIER_ORDER.indexOf(DEFAULT_TIER)).toBeGreaterThan(TIER_ORDER.indexOf('local'));
    expect(TIER_ORDER.indexOf(DEFAULT_TIER)).toBeLessThan(TIER_ORDER.indexOf('basic'));
  });

  it('keeps the canonical enterprise tier as the highest tier', () => {
    expect(TIER_ORDER[TIER_ORDER.length - 1]).toBe('enterprise');
    expect(TIER_ORDER.indexOf('max')).toBeLessThan(TIER_ORDER.indexOf('max_15x'));
  });

  it('tierAtLeast — local and byok are peers, not a ladder', () => {
    expect(tierAtLeast('local', 'byok')).toBe(true);
    expect(tierAtLeast('byok', 'local')).toBe(true);
  });

  it('CRITICAL: no unpaid tier reaches the first paid tier', () => {
    for (const unpaid of ['local', 'byok', 'free'] as const) {
      expect(tierAtLeast(unpaid, 'basic')).toBe(false);
    }
  });

  it('tierAtLeast — byok meets byok requirement', () => {
    expect(tierAtLeast('byok', 'byok')).toBe(true);
  });

  it('tierAtLeast — pro meets basic requirement', () => {
    expect(tierAtLeast('pro', 'basic')).toBe(true);
  });

  it('tierAtLeast — basic does not meet pro requirement', () => {
    expect(tierAtLeast('basic', 'pro')).toBe(false);
  });

  it('tierAtLeast — unknown tier always returns false', () => {
    expect(tierAtLeast('unknown', 'byok')).toBe(false);
    expect(tierAtLeast('byok', 'unknown')).toBe(false);
  });
});

const ENDPOINT_ALLOWED_HOSTS = new Set([
  'api.agiworkforce.com',
  'agiworkforce.com',
  'agiworkforce-api.vercel.app',
]);

const isValidApiEndpoint = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (!isHttps && !isLocalhost) return false;
    if (!isLocalhost && !ENDPOINT_ALLOWED_HOSTS.has(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
};

describe('endpoint validation', () => {
  it('allows known HTTPS API endpoints', () => {
    expect(isValidApiEndpoint('https://api.agiworkforce.com/v1/chat')).toBe(true);
  });

  it('allows localhost for local development', () => {
    expect(isValidApiEndpoint('http://localhost:8787/v1/chat')).toBe(true);
  });

  it('allows 127.0.0.1 for local development', () => {
    expect(isValidApiEndpoint('http://127.0.0.1:8787/v1/chat')).toBe(true);
  });

  it('CRITICAL: rejects HTTP to non-localhost (MITM risk)', () => {
    expect(isValidApiEndpoint('http://api.agiworkforce.com/v1/chat')).toBe(false);
  });

  it('CRITICAL: rejects unknown HTTPS hosts (data exfiltration)', () => {
    expect(isValidApiEndpoint('https://evil.com/capture')).toBe(false);
    expect(isValidApiEndpoint('https://attacker.agiworkforce.com.evil.com/')).toBe(false);
  });

  it('CRITICAL: rejects invalid URLs', () => {
    expect(isValidApiEndpoint('not-a-url')).toBe(false);
    expect(isValidApiEndpoint('')).toBe(false);
  });

  it('CRITICAL: rejects javascript: and data: schemes', () => {
    expect(isValidApiEndpoint('javascript:alert(1)')).toBe(false);
    expect(isValidApiEndpoint('data:text/html,<script>alert(1)</script>')).toBe(false);
  });
});

describe('vscode extension trust-boundary gates', () => {
  it('CRITICAL: byok default never over-grants to managed-cloud features', () => {
    const defaultTier = 'byok';
    expect(tierAtLeast(defaultTier, 'basic')).toBe(false);
    expect(tierAtLeast(defaultTier, 'pro')).toBe(false);
    expect(tierAtLeast(defaultTier, 'max')).toBe(false);
  });

  it('CRITICAL: local tier cannot access any paid feature', () => {
    expect(tierAtLeast('local', 'basic')).toBe(false);
    expect(tierAtLeast('local', 'pro')).toBe(false);
    expect(tierAtLeast('local', 'max')).toBe(false);
  });

  it('tier transitions are monotonic (non-decreasing — equal ranks are peers)', () => {
    for (let i = 0; i < TIER_ORDER.length - 1; i++) {
      const lower = TIER_ORDER[i]!;
      const higher = TIER_ORDER[i + 1]!;
      expect(tierAtLeast(higher, lower)).toBe(true);
    }
  });

  it('every paid tier strictly exceeds every unpaid tier', () => {
    for (const unpaid of ['local', 'byok', 'free'] as const) {
      for (const paid of ['basic', 'pro', 'max'] as const) {
        expect(tierAtLeast(paid, unpaid)).toBe(true);
        expect(tierAtLeast(unpaid, paid)).toBe(false);
      }
    }
  });
});
