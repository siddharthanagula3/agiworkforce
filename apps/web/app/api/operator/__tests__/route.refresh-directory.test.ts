import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));

const identity = vi.hoisted(() => ({ userId: 'operator_1' as string | null }));
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: identity.userId })),
}));
vi.mock('@/lib/api-auth', () => ({ assertAccountActive: vi.fn(async () => {}) }));

const securityEvents: Array<Record<string, unknown>> = [];
vi.mock('@/lib/security-audit', () => ({
  logSecurityEvent: vi.fn(async (event: Record<string, unknown>) => {
    securityEvents.push(event);
  }),
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));

const service = vi.hoisted(() => ({
  previewBulkUsageReset: vi.fn(),
  resetAllUsersUsage: vi.fn(),
  grantBonusCredits: vi.fn(),
  resetUserUsage: vi.fn(),
  readOperatorOverview: vi.fn(),
  readRecentFeedback: vi.fn(),
  readRecentUsers: vi.fn(),
}));
vi.mock('@/features/admin/services/operator-metrics', () => service);

const ingest = vi.hoisted(() => ({
  ingestConnectorDirectory: vi.fn(),
  ingestBudgetForMaxDuration: vi.fn(() => ({ crawlMs: 180_000, probeMs: 240_000 })),
}));
vi.mock('@/lib/connectors/directory/ingest', () => ingest);

import { PLATFORM_ADMIN_ENV_VAR } from '@/features/admin/lib/platform-admin-access';
import { NextRequest } from 'next/server';
import { POST, maxDuration } from '../route';

const SUMMARY = {
  mode: 'bootstrap',
  requestsUsed: 12,
  entriesSeen: 1200,
  entriesUpserted: 900,
  entriesRemoved: 3,
  crawlStop: 'exhausted',
  authProbesRun: 40,
  authProbesResolved: 25,
  authProbeErrors: 0,
  authProbeBacklog: 500,
  totalRecords: 950,
  bootstrapComplete: true,
  wroteSnapshot: true,
  durationMs: 42_000,
};

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/operator', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  securityEvents.length = 0;
  vi.clearAllMocks();
  identity.userId = 'operator_1';
  process.env[PLATFORM_ADMIN_ENV_VAR] = 'operator_1';
  ingest.ingestConnectorDirectory.mockResolvedValue(SUMMARY);
});

describe('refresh-connector-directory', () => {
  it('runs one ingest for a platform admin and returns its summary', async () => {
    const res = await POST(post({ action: 'refresh-connector-directory' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(SUMMARY);
    expect(ingest.ingestConnectorDirectory).toHaveBeenCalledTimes(1);
    expect(ingest.ingestConnectorDirectory).toHaveBeenCalledWith({
      budget: { crawlMs: 180_000, probeMs: 240_000 },
      rebuild: false,
    });
    expect(maxDuration).toBeGreaterThan(0);
    const event = securityEvents.at(-1);
    expect(event?.['eventType']).toBe('admin_action');
    expect((event?.['details'] as Record<string, unknown>)['action']).toBe(
      'refresh-connector-directory',
    );
    expect((event?.['details'] as Record<string, unknown>)['total_records']).toBe(950);
  });

  it('passes a rebuild request through to the ingest', async () => {
    const res = await POST(post({ action: 'refresh-connector-directory', mode: 'rebuild' }));

    expect(res.status).toBe(200);
    expect(ingest.ingestConnectorDirectory).toHaveBeenCalledWith({
      budget: { crawlMs: 180_000, probeMs: 240_000 },
      rebuild: true,
    });
  });

  it('refuses a signed-in account outside the platform-admin allowlist', async () => {
    process.env[PLATFORM_ADMIN_ENV_VAR] = 'someone_else';

    const res = await POST(post({ action: 'refresh-connector-directory' }));

    expect(res.status).toBe(404);
    expect(ingest.ingestConnectorDirectory).not.toHaveBeenCalled();
    expect(securityEvents).toHaveLength(0);
  });

  it('refuses an anonymous request', async () => {
    identity.userId = null;

    const res = await POST(post({ action: 'refresh-connector-directory' }));

    expect(res.status).toBe(401);
    expect(ingest.ingestConnectorDirectory).not.toHaveBeenCalled();
  });

  it('reports a failed ingest as an internal error without leaking the cause', async () => {
    ingest.ingestConnectorDirectory.mockRejectedValueOnce(new Error('registry down'));

    const res = await POST(post({ action: 'refresh-connector-directory' }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('registry down');
  });
});
