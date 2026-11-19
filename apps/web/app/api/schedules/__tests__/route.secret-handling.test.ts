import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type OrgPolicyModule = typeof import('@/lib/services/organization-policy-gate');
type ScheduleServiceModule = typeof import('@/lib/services/schedule-service');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  getUserScopedDb: vi.fn(),
  resolveSecretHandlingPolicy: vi.fn(),
  createSchedule: vi.fn(),
  updateSchedule: vi.fn(),
  assertScheduleQuota: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => ({})) }));
vi.mock('@/lib/managed-compute-gate', () => ({
  buildWorkspaceAccessGateResponse: vi.fn(async () => null),
  buildWorkspaceFeatureGateResponse: vi.fn(async () => null),
}));
vi.mock('@/lib/services/entitlement-resolution', () => ({
  resolveEntitledPlanTier: vi.fn(async () => 'pro'),
}));
vi.mock('@/lib/services/managed-usage-request-service', () => ({ UPGRADE_HREF: '/pricing' }));
vi.mock('@/lib/services/organization-policy-gate', async (importOriginal) => ({
  ...(await importOriginal<OrgPolicyModule>()),
  resolveSecretHandlingPolicy: mocks.resolveSecretHandlingPolicy,
}));
vi.mock('@/lib/services/schedule-service', async (importOriginal) => ({
  ...(await importOriginal<ScheduleServiceModule>()),
  assertScheduleQuota: mocks.assertScheduleQuota,
  createSchedule: mocks.createSchedule,
  updateSchedule: mocks.updateSchedule,
}));

const { POST } = await import('../route');
const { PUT } = await import('../[id]/route');

const STRIPE_KEY = `sk_live_${'a'.repeat(30)}`;
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

function jsonRequest(method: 'POST' | 'PUT', body: Record<string, unknown>): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/schedules', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const scheduleBody = (prompt: string) => ({
  name: 'Deploy check',
  prompt,
  scheduleType: 'cron',
  cronExpression: '0 9 * * *',
  timezone: 'UTC',
});

describe('schedule save secret handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.assertScheduleQuota.mockResolvedValue(undefined);
    mocks.getUserScopedDb.mockResolvedValue({
      db: { transaction: async (run: (tx: unknown) => unknown) => run({ execute: vi.fn() }) },
      userId: 'user-1',
      surface: 'web',
    });
    mocks.createSchedule.mockResolvedValue({ id: 'task-1' });
    mocks.updateSchedule.mockResolvedValue({ id: 'task-1' });
  });

  it('refuses to create a schedule whose prompt holds a secret when the workspace blocks secrets', async () => {
    mocks.resolveSecretHandlingPolicy.mockResolvedValue({
      mode: 'block',
      organizationId: ORGANIZATION_ID,
    });

    const response = await POST(jsonRequest('POST', scheduleBody(`Deploy with ${STRIPE_KEY}`)));

    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(STRIPE_KEY);
    expect(mocks.createSchedule).not.toHaveBeenCalled();
  });

  it('refuses to edit a schedule into one whose prompt holds a secret when the workspace blocks secrets', async () => {
    mocks.resolveSecretHandlingPolicy.mockResolvedValue({
      mode: 'block',
      organizationId: ORGANIZATION_ID,
    });

    const response = await PUT(jsonRequest('PUT', scheduleBody(`Deploy with ${STRIPE_KEY}`)), {
      params: Promise.resolve({ id: 'task-1' }),
    });

    expect(response.status).toBe(400);
    expect(mocks.updateSchedule).not.toHaveBeenCalled();
  });

  it.each(['warn', 'redact'])('saves the prompt unchanged in %s mode', async (mode) => {
    mocks.resolveSecretHandlingPolicy.mockResolvedValue({ mode, organizationId: null });
    const body = scheduleBody(`Deploy with ${STRIPE_KEY}`);

    const response = await POST(jsonRequest('POST', body));

    expect(response.status).toBe(201);
    expect(mocks.createSchedule).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      expect.objectContaining({ prompt: body.prompt }),
      expect.anything(),
    );
  });
});
