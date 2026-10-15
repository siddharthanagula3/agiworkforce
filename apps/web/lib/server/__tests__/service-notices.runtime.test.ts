import { afterEach, describe, expect, it, vi } from 'vitest';
import { UPSTASH_REST_TOKEN_ENV_NAMES, UPSTASH_REST_URL_ENV_NAMES } from '@agiworkforce/key-value';

import type { HealthCheckResult } from '../health-check';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({ getCachedHealthChecks: vi.fn() }));

vi.mock('@/lib/server/health-check', () => ({
  DEPENDENCY_LIVE_CHECKS: {},
  NOT_CONFIGURED: 'not configured',
  getCachedHealthChecks: mocks.getCachedHealthChecks,
  runHealthChecks: vi.fn(),
}));

const healthy = { status: 'healthy' as const };

const SHARED_STORE_MISSING: HealthCheckResult = {
  status: 'unhealthy',
  timestamp: '2026-10-02T06:00:00.000Z',
  dependencies: [],
  checks: {
    database: healthy,
    stripe: healthy,
    environment: {
      status: 'unhealthy',
      missingCount: 1,
      unreadyDependencies: [
        { id: 'key_value', criticality: 'core', missing: ['UPSTASH_REDIS_REST_URL'] },
      ],
    },
    chat: healthy,
    work: healthy,
    voice: healthy,
    search: healthy,
    vector: healthy,
    cache: healthy,
    email: healthy,
    identity: healthy,
  },
};

describe('service notices in a production runtime without a shared store', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('still loads and announces the incident the missing store causes', async () => {
    vi.stubEnv('AGI_DEPLOY_ENV', '');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY', '');
    for (const name of [...UPSTASH_REST_URL_ENV_NAMES, ...UPSTASH_REST_TOKEN_ENV_NAMES]) {
      vi.stubEnv(name, '');
    }
    mocks.getCachedHealthChecks.mockResolvedValue(SHARED_STORE_MISSING);
    vi.resetModules();

    const { readServiceNotices } = await import('../service-notices');

    expect(await readServiceNotices()).toEqual([
      expect.objectContaining({ id: 'incident:product', kind: 'incident', scope: 'product' }),
    ]);
  });
});
