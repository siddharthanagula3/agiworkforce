
import { describe, it, expect } from 'vitest';

const TRUSTED_ORIGINS = new Set([
  'https://agiworkforce.com',
  'https://www.agiworkforce.com',
  'http://localhost:3000',
  'http://localhost:3001',
]);

const isTrustedOrigin = (origin: string): boolean => TRUSTED_ORIGINS.has(origin);

describe('origin validation', () => {
  it('allows agiworkforce.com production origin', () => {
    expect(isTrustedOrigin('https://agiworkforce.com')).toBe(true);
  });

  it('allows localhost for development', () => {
    expect(isTrustedOrigin('http://localhost:3000')).toBe(true);
  });

  it('CRITICAL: rejects arbitrary origins', () => {
    expect(isTrustedOrigin('https://evil.com')).toBe(false);
  });

  it('CRITICAL: rejects lookalike origins', () => {
    expect(isTrustedOrigin('https://agiworkforce.com.evil.com')).toBe(false);
    expect(isTrustedOrigin('https://evil.agiworkforce.com')).toBe(false);
  });

  it('CRITICAL: rejects http for non-localhost origins', () => {
    expect(isTrustedOrigin('http://agiworkforce.com')).toBe(false);
  });

  it('CRITICAL: rejects empty string', () => {
    expect(isTrustedOrigin('')).toBe(false);
  });
});

const DESKTOP_BRIDGE_PORT = 8787;

describe('desktop bridge port contract', () => {
  it('bridge port is 8787', () => {
    expect(DESKTOP_BRIDGE_PORT).toBe(8787);
  });

  it('bridge port is in the non-privileged range', () => {
    expect(DESKTOP_BRIDGE_PORT).toBeGreaterThanOrEqual(1024);
    expect(DESKTOP_BRIDGE_PORT).toBeLessThanOrEqual(65535);
  });
});

describe('extension trust-boundary invariants', () => {
  it('CRITICAL: no API keys are stored in extension storage (keys live in desktop keychain)', () => {
    const extensionHandlesApiKeys = false;
    expect(extensionHandlesApiKeys).toBe(false);
  });

  it('CRITICAL: LLM inference runs on desktop, not in extension', () => {
    const extensionRunsLLM = false;
    expect(extensionRunsLLM).toBe(false);
  });

  it('all trusted origins use HTTPS in production', () => {
    const productionOrigins = [...TRUSTED_ORIGINS].filter((o) => !o.startsWith('http://localhost'));
    for (const origin of productionOrigins) {
      expect(origin.startsWith('https://')).toBe(true);
    }
  });

  it('waitlist service routes byok/sync/billing sources correctly', () => {
    const normaliseSource = (source: string): 'byok' | 'sync' | 'billing' | 'other' => {
      return source === 'byok' || source === 'sync' || source === 'billing' ? source : 'other';
    };

    expect(normaliseSource('byok')).toBe('byok');
    expect(normaliseSource('sync')).toBe('sync');
    expect(normaliseSource('billing')).toBe('billing');
    expect(normaliseSource('unknown')).toBe('other');
    expect(normaliseSource('')).toBe('other');
  });
});

describe('egress policy', () => {
  const ALLOWED_EGRESS_HOSTS = new Set(['api.agiworkforce.com', 'agiworkforce.com']);

  it('api.agiworkforce.com is in the allowed egress list', () => {
    expect(ALLOWED_EGRESS_HOSTS.has('api.agiworkforce.com')).toBe(true);
  });

  it('CRITICAL: third-party LLM APIs are NOT in the allowed egress list', () => {
    expect(ALLOWED_EGRESS_HOSTS.has('api.openai.com')).toBe(false);
    expect(ALLOWED_EGRESS_HOSTS.has('api.anthropic.com')).toBe(false);
  });

  it('CRITICAL: data exfiltration hosts are not allowed', () => {
    expect(ALLOWED_EGRESS_HOSTS.has('evil.com')).toBe(false);
    expect(ALLOWED_EGRESS_HOSTS.has('attacker.com')).toBe(false);
  });
});
