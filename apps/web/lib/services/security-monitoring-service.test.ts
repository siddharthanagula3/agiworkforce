import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: mocks.query }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { SecurityMonitoringService } from './security-monitoring-service';

describe('SecurityMonitoringService severity contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('normalizes legacy and current stored severities for API consumers', async () => {
    mocks.query.mockResolvedValue([
      {
        id: 'legacy-error',
        user_id: 'user-1',
        event_type: 'legacy_event',
        severity: 'error',
        ip_address: null,
        user_agent: null,
        endpoint: null,
        details: null,
        created_at: '2026-07-31T12:00:00.000Z',
      },
      {
        id: 'current-medium',
        user_id: 'user-2',
        event_type: 'auth_failed',
        severity: 'medium',
        ip_address: null,
        user_agent: null,
        endpoint: '/login',
        details: { source: 'web' },
        created_at: '2026-07-31T12:01:00.000Z',
      },
    ]);

    await expect(SecurityMonitoringService.getRecentEvents()).resolves.toEqual([
      expect.objectContaining({ id: 'legacy-error', severity: 'high', details: {} }),
      expect.objectContaining({ id: 'current-medium', severity: 'medium' }),
    ]);
  });
});
