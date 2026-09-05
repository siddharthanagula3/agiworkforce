import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'operator_1' })) }));
vi.mock('@/lib/api-auth', () => ({ assertAccountActive: vi.fn(async () => {}) }));

const securityEvents: Array<Record<string, unknown>> = [];
vi.mock('@/lib/security-audit', () => ({
  logSecurityEvent: vi.fn(async (e: Record<string, unknown>) => {
    securityEvents.push(e);
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

import { PLATFORM_ADMIN_ENV_VAR } from '@/features/admin/lib/platform-admin-access';

// The real platform-admin gate runs; the operator is authorised the same way a
// real one would be, so these tests cover the access path too.
process.env[PLATFORM_ADMIN_ENV_VAR] = 'operator_1';

import { NextRequest } from 'next/server';
import { POST, BULK_RESET_CONFIRMATION } from '../route';

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
  service.previewBulkUsageReset.mockResolvedValue({ affectedUsers: 3, clearedCents: 1234 });
  service.resetAllUsersUsage.mockResolvedValue({ affectedUsers: 3, clearedCents: 1234 });
  service.grantBonusCredits.mockResolvedValue({ granted: true, balanceCents: 3000 });
  service.resetUserUsage.mockResolvedValue({ reset: true, clearedCents: 500 });
});

describe('fleet-wide usage reset', () => {
  it('previews the blast radius without mutating anything', async () => {
    const res = await POST(post({ action: 'preview-reset-all' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ affectedUsers: 3, clearedCents: 1234 });
    expect(service.resetAllUsersUsage).not.toHaveBeenCalled();
  });

  it('refuses to run without the typed confirmation', async () => {
    const res = await POST(post({ action: 'reset-all-usage' }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(service.resetAllUsersUsage).not.toHaveBeenCalled();
  });

  it('refuses a near-miss confirmation rather than guessing intent', async () => {
    const res = await POST(post({ action: 'reset-all-usage', confirm: 'reset all usage' }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(service.resetAllUsersUsage).not.toHaveBeenCalled();
  });

  it('runs on the exact phrase and records a critical audit entry', async () => {
    const res = await POST(post({ action: 'reset-all-usage', confirm: BULK_RESET_CONFIRMATION }));
    expect(res.status).toBe(200);
    expect(service.resetAllUsersUsage).toHaveBeenCalledWith('operator_1');
    const event = securityEvents.at(-1);
    expect(event?.['severity']).toBe('critical');
    expect((event?.['details'] as Record<string, unknown>)['affected_users']).toBe(3);
  });
});

describe('goodwill credit grants', () => {
  it('grants a positive amount with a stated reason', async () => {
    const res = await POST(
      post({ action: 'grant-credits', userId: 'u1', amountCents: 1000, reason: 'outage 8/20' }),
    );
    expect(res.status).toBe(200);
    expect(service.grantBonusCredits).toHaveBeenCalledWith('u1', 1000, 'operator_1', 'outage 8/20');
  });

  it('requires a reason so the grant stays explainable', async () => {
    const res = await POST(post({ action: 'grant-credits', userId: 'u1', amountCents: 1000 }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(service.grantBonusCredits).not.toHaveBeenCalled();
  });

  it('rejects a zero, negative, or fractional amount', async () => {
    for (const amountCents of [0, -500, 10.5]) {
      const res = await POST(
        post({ action: 'grant-credits', userId: 'u1', amountCents, reason: 'x' }),
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
    expect(service.grantBonusCredits).not.toHaveBeenCalled();
  });

  it('caps a single grant so a slipped zero cannot hand out $5,000', async () => {
    const res = await POST(
      post({ action: 'grant-credits', userId: 'u1', amountCents: 500_000, reason: 'oops' }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(service.grantBonusCredits).not.toHaveBeenCalled();
  });
});

describe('unknown actions', () => {
  it('rejects anything it does not recognise', async () => {
    const res = await POST(post({ action: 'drop-tables' }));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
