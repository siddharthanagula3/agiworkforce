import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: mocks.query }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { SecurityMonitoringService, storedSeveritiesFor } from './security-monitoring-service';

describe('SecurityMonitoringService severity contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters on every stored value that reads back as the severity asked for', async () => {
    mocks.query.mockResolvedValue([]);

    await SecurityMonitoringService.getRecentEvents(10, 'high');

    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('severity = any($2::text[])');
    expect(params[1]).toEqual(['high', 'error']);
  });

  it('widens each severity to the audit value that normalizes onto it', () => {
    expect(storedSeveritiesFor('low')).toEqual(['low', 'info']);
    expect(storedSeveritiesFor('medium')).toEqual(['medium', 'warning']);
    expect(storedSeveritiesFor('high')).toEqual(['high', 'error']);
    expect(storedSeveritiesFor('critical')).toEqual(['critical']);
  });

  it('counts an alert threshold over both vocabularies, not just its own', async () => {
    mocks.query.mockResolvedValue([{ count: 0 }]);

    await SecurityMonitoringService.checkAlerts();

    const severityFiltered = mocks.query.mock.calls.filter(([sql]) =>
      String(sql).includes('severity = any('),
    );
    expect(severityFiltered).not.toHaveLength(0);
    for (const [, params] of severityFiltered) {
      expect(params).toContainEqual(['critical']);
    }
  });

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
