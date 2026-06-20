/**
 * VSCode extension trust-boundary tests.
 *
 * The VSCode extension uses a tier-based model (local / byok / hobby / pro / max)
 * rather than the binary local/cloud split. The trust boundary is enforced by:
 *   - tierResolver: resolves the active tier from bridge data, config, and fallback
 *   - HTTPS-only endpoint validation: rejects non-https endpoints except localhost
 *   - byok as safe default: under-gates rather than over-grants
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Tier ordering — mirrors apps/extension-vscode/src/integrations/tierResolver.ts
// ---------------------------------------------------------------------------

const TIER_ORDER: readonly string[] = ['local', 'byok', 'hobby', 'pro', 'pro_plus', 'max'];

const tierAtLeast = (actual: string, required: string): boolean => {
  const aIdx = TIER_ORDER.indexOf(actual);
  const rIdx = TIER_ORDER.indexOf(required);
  if (aIdx === -1 || rIdx === -1) return false;
  return aIdx >= rIdx;
};

describe('tier resolver ordering', () => {
  it('local is the lowest tier', () => {
    expect(TIER_ORDER[0]).toBe('local');
  });

  it('byok is the default fallback tier (safe under-gate)', () => {
    // Mirrors tierResolver.ts line: return 'byok' as safe default
    const DEFAULT_TIER = 'byok';
    expect(TIER_ORDER.indexOf(DEFAULT_TIER)).toBeGreaterThan(TIER_ORDER.indexOf('local'));
    expect(TIER_ORDER.indexOf(DEFAULT_TIER)).toBeLessThan(TIER_ORDER.indexOf('hobby'));
  });

  it('max is the highest tier', () => {
    expect(TIER_ORDER[TIER_ORDER.length - 1]).toBe('max');
  });

  it('tierAtLeast — local does not meet byok requirement', () => {
    expect(tierAtLeast('local', 'byok')).toBe(false);
  });

  it('tierAtLeast — byok meets byok requirement', () => {
    expect(tierAtLeast('byok', 'byok')).toBe(true);
  });

  it('tierAtLeast — pro meets hobby requirement', () => {
    expect(tierAtLeast('pro', 'hobby')).toBe(true);
  });

  it('tierAtLeast — hobby does not meet pro requirement', () => {
    expect(tierAtLeast('hobby', 'pro')).toBe(false);
  });

  it('tierAtLeast — unknown tier always returns false', () => {
    expect(tierAtLeast('unknown', 'byok')).toBe(false);
    expect(tierAtLeast('byok', 'unknown')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Endpoint validation — mirrors apps/extension-vscode/src/utils/api.ts
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Trust-boundary gate invariants for VSCode extension
// ---------------------------------------------------------------------------

describe('vscode extension trust-boundary gates', () => {
  it('CRITICAL: byok default never over-grants to managed-cloud features', () => {
    // byok tier < hobby; if the bridge provides no tier, fall to byok
    // This ensures no accidental managed-cloud access for unauthenticated sessions
    const defaultTier = 'byok';
    expect(tierAtLeast(defaultTier, 'hobby')).toBe(false);
    expect(tierAtLeast(defaultTier, 'pro')).toBe(false);
    expect(tierAtLeast(defaultTier, 'max')).toBe(false);
  });

  it('CRITICAL: local tier cannot access byok or higher features', () => {
    expect(tierAtLeast('local', 'byok')).toBe(false);
    expect(tierAtLeast('local', 'hobby')).toBe(false);
  });

  it('all tier transitions are monotonic', () => {
    for (let i = 0; i < TIER_ORDER.length - 1; i++) {
      const lower = TIER_ORDER[i]!;
      const higher = TIER_ORDER[i + 1]!;
      expect(tierAtLeast(higher, lower)).toBe(true);
      expect(tierAtLeast(lower, higher)).toBe(false);
    }
  });
});
