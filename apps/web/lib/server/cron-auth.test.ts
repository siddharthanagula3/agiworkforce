import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import { resetCronAuthThrottleForTests, verifyCronRequest } from './cron-auth';

function request(host = 'agiworkforce.com', authorization?: string): Request {
  return new Request(`https://${host}/api/cron/test`, {
    headers: {
      host,
      ...(authorization ? { authorization } : {}),
    },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetCronAuthThrottleForTests();
});

describe('verifyCronRequest', () => {
  it('accepts only the configured bearer secret', () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    expect(verifyCronRequest(request('agiworkforce.com', 'Bearer cron-secret'))).toBe(true);
    expect(verifyCronRequest(request('agiworkforce.com', 'Bearer wrong'))).toBe(false);
    expect(verifyCronRequest(request('agiworkforce.com'))).toBe(false);
  });

  it('rejects near-miss and truncated secrets', () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    expect(verifyCronRequest(request('agiworkforce.com', 'Bearer cron-secrey'))).toBe(false);
    expect(verifyCronRequest(request('agiworkforce.com', 'Bearer c'))).toBe(false);
    expect(verifyCronRequest(request('agiworkforce.com', 'cron-secret'))).toBe(false);
  });

  it('throttles a client after repeated wrong secrets, even once it guesses right', () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    const from = (ip: string, authorization: string) =>
      new Request('https://agiworkforce.com/api/cron/test', {
        headers: { host: 'agiworkforce.com', authorization, 'x-forwarded-for': ip },
      });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(verifyCronRequest(from('203.0.113.7', `Bearer guess-${attempt}`))).toBe(false);
    }
    expect(verifyCronRequest(from('203.0.113.7', 'Bearer cron-secret'))).toBe(false);
    expect(verifyCronRequest(from('198.51.100.2', 'Bearer cron-secret'))).toBe(true);
  });

  // Constant-time comparison is not observable from the return value, so the guard is on the source.
  it('compares the bearer secret without a variable-time equality check', () => {
    const source = readFileSync(join(import.meta.dirname, 'cron-auth.ts'), 'utf8');
    expect(source).toMatch(/timingSafeEqual\(/);
    expect(source).not.toMatch(/authHeader\s*[!=]==|[!=]==\s*`Bearer/);
  });

  it('fails closed when no secret or explicit local bypass is configured', () => {
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CRON_DEV_BYPASS', '');
    expect(verifyCronRequest(request())).toBe(false);
  });

  it('allows the explicit development bypass only from loopback', () => {
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('CRON_DEV_BYPASS', '1');
    expect(verifyCronRequest(request('localhost:3000'))).toBe(true);
    expect(verifyCronRequest(request('preview.example.com'))).toBe(false);
  });
});
