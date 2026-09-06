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

const connectorIngest = vi.hoisted(() => ({
  ingestConnectorDirectory: vi.fn(),
  ingestBudgetForMaxDuration: vi.fn(() => ({ crawlMs: 180_000, probeMs: 240_000 })),
}));
vi.mock('@/lib/connectors/directory/ingest', () => connectorIngest);

const pluginIngest = vi.hoisted(() => ({
  ingestPluginDirectory: vi.fn(),
  ingestBudgetForMaxDuration: vi.fn(() => ({
    manifestMs: 120_000,
    publicMs: 320_000,
    inspectionMs: 720_000,
    totalMs: 800_000,
  })),
}));
vi.mock('@/features/plugins/server/directory/ingest', () => pluginIngest);

import { PLATFORM_ADMIN_ENV_VAR } from '@/features/admin/lib/platform-admin-access';
import { NextRequest } from 'next/server';
import { POST } from '../route';

const SUMMARY = {
  marketplacesFetched: 1,
  marketplacesFailed: [],
  manifestPlugins: 291,
  manifestPluginsSkipped: 0,
  publicCards: 335,
  publicComplete: true,
  publicMatched: 284,
  publicOnly: 51,
  detailFetches: 28,
  inspectionsRun: 40,
  inspectionsCached: 200,
  inspectionsFailed: 1,
  inspectionsPending: 50,
  rateLimited: false,
  verified: 300,
  withInstalls: 300,
  webInstallable: 180,
  duplicatesDropped: 3,
  bySource: { marketplace: 310, partner: 23 },
  totalRecords: 333,
  wroteSnapshot: true,
  durationMs: 61_000,
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
  pluginIngest.ingestPluginDirectory.mockResolvedValue(SUMMARY);
});

describe('refresh-plugin-directory', () => {
  it('runs one ingest for a platform admin, audits it and returns the summary', async () => {
    const res = await POST(post({ action: 'refresh-plugin-directory' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(SUMMARY);
    expect(pluginIngest.ingestPluginDirectory).toHaveBeenCalledTimes(1);
    expect(pluginIngest.ingestPluginDirectory).toHaveBeenCalledWith({
      budget: { manifestMs: 120_000, publicMs: 320_000, inspectionMs: 720_000, totalMs: 800_000 },
      rebuild: false,
    });
    expect(connectorIngest.ingestConnectorDirectory).not.toHaveBeenCalled();
    const event = securityEvents.at(-1);
    expect(event?.['eventType']).toBe('admin_action');
    const details = event?.['details'] as Record<string, unknown>;
    expect(details['action']).toBe('refresh-plugin-directory');
    expect(details['total_records']).toBe(333);
    expect(details['inspections_pending']).toBe(50);
  });

  it('passes a rebuild request through to the ingest', async () => {
    const res = await POST(post({ action: 'refresh-plugin-directory', mode: 'rebuild' }));

    expect(res.status).toBe(200);
    expect(pluginIngest.ingestPluginDirectory).toHaveBeenCalledWith(
      expect.objectContaining({ rebuild: true }),
    );
  });

  it('refuses a signed-in account outside the platform-admin allowlist', async () => {
    process.env[PLATFORM_ADMIN_ENV_VAR] = 'someone_else';

    const res = await POST(post({ action: 'refresh-plugin-directory' }));

    expect(res.status).toBe(404);
    expect(pluginIngest.ingestPluginDirectory).not.toHaveBeenCalled();
    expect(securityEvents).toHaveLength(0);
  });

  it('refuses an anonymous request', async () => {
    identity.userId = null;

    const res = await POST(post({ action: 'refresh-plugin-directory' }));

    expect(res.status).toBe(401);
    expect(pluginIngest.ingestPluginDirectory).not.toHaveBeenCalled();
  });

  it('surfaces a held lease as a conflict and hides other failures', async () => {
    const { createError } = await import('@/lib/errors');
    pluginIngest.ingestPluginDirectory.mockRejectedValueOnce(
      createError.conflict('already running'),
    );
    const conflict = await POST(post({ action: 'refresh-plugin-directory' }));
    expect(conflict.status).toBe(409);

    pluginIngest.ingestPluginDirectory.mockRejectedValueOnce(new Error('github down'));
    const failed = await POST(post({ action: 'refresh-plugin-directory' }));
    expect(failed.status).toBe(500);
    expect(JSON.stringify(await failed.json())).not.toContain('github down');
  });
});
