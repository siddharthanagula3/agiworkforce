import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/security-audit', () => ({
  logSecurityEvent: vi.fn(async () => undefined),
  getClientIp: () => '203.0.113.7',
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));

const { authUser, query } = vi.hoisted(() => ({
  authUser: { current: { userId: 'operator-1' } as { userId: string } | null },
  query: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: async () => {
    if (!authUser.current) throw new Error('unauthenticated');
    return authUser.current;
  },
  assertAccountActive: vi.fn(async () => undefined),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({ query }) }));

import { NextRequest } from 'next/server';
import { PLATFORM_ADMIN_ENV_VAR } from '@/features/admin/lib/platform-admin-access';
import { GET } from '../route';

const originalAllowlist = process.env[PLATFORM_ADMIN_ENV_VAR];

function request(): NextRequest {
  return new NextRequest('https://app.example.com/api/admin/service-health');
}

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue([]);
  authUser.current = { userId: 'operator-1' };
});

afterEach(() => {
  if (originalAllowlist === undefined) delete process.env[PLATFORM_ADMIN_ENV_VAR];
  else process.env[PLATFORM_ADMIN_ENV_VAR] = originalAllowlist;
});

describe('GET /api/admin/service-health', () => {
  it('answers a platform operator with every panel and no caching', async () => {
    process.env[PLATFORM_ADMIN_ENV_VAR] = 'operator-1';

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(Object.keys(body).sort()).toEqual(
      ['browser', 'files', 'queues', 'remote', 'tools', 'windowEnd', 'windowStart'].sort(),
    );
    expect(query).toHaveBeenCalledTimes(5);
  });

  it('refuses a signed-in user who is not a platform operator, before any read', async () => {
    process.env[PLATFORM_ADMIN_ENV_VAR] = 'someone-else';

    expect((await GET(request())).status).toBe(404);
    expect(query).not.toHaveBeenCalled();
  });
});
