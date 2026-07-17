import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import { verifyCronRequest } from './cron-auth';

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
});

describe('verifyCronRequest', () => {
  it('accepts only the configured bearer secret', () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    expect(verifyCronRequest(request('agiworkforce.com', 'Bearer cron-secret'))).toBe(true);
    expect(verifyCronRequest(request('agiworkforce.com', 'Bearer wrong'))).toBe(false);
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
