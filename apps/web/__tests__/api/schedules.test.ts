import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

type ManagedComputeGateModule = typeof import('@/lib/managed-compute-gate');

const gate = vi.hoisted(() => ({ access: vi.fn(), feature: vi.fn() }));

vi.mock('@/lib/managed-compute-gate', async (importOriginal) => {
  const actual = await importOriginal<ManagedComputeGateModule>();
  gate.access.mockImplementation(actual.buildWorkspaceAccessGateResponse);
  gate.feature.mockImplementation(actual.buildWorkspaceFeatureGateResponse);
  return {
    ...actual,
    buildWorkspaceAccessGateResponse: gate.access,
    buildWorkspaceFeatureGateResponse: gate.feature,
  };
});

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(() => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(() => null) }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: vi.fn() }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn() }));
vi.mock('@/lib/services/schedule-service', () => ({
  ScheduleConflictError: class ScheduleConflictError extends Error {},
  ScheduleLimitError: class ScheduleLimitError extends Error {
    constructor(
      message: string,
      readonly planTier: string,
      readonly limit: number,
    ) {
      super(message);
    }
  },
  ScheduleNotFoundError: class ScheduleNotFoundError extends Error {},
  ScheduleValidationError: class ScheduleValidationError extends Error {},
  assertScheduleQuota: vi.fn(),
  createSchedule: vi.fn(),
  listSchedules: vi.fn(),
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: vi.fn() },
}));

import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  ScheduleLimitError,
  ScheduleValidationError,
  assertScheduleQuota,
  createSchedule,
  listSchedules,
} from '@/lib/services/schedule-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { GET, POST } from '@/app/api/schedules/route';

const tx = { query: vi.fn(), execute: vi.fn(async () => 0) };
const db = { query: vi.fn(), transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
// The workspace feature gate reads the caller's workspace from the same Neon
// pool as the quota check. This caller is a personal user with no workspace, so
// every workspace lookup finds no row and the gate leaves the request unscoped.
const quotaDb = { query: vi.fn(async () => [] as unknown[]) };
const schedule = { id: 'task-1', userId: 'user-1', scheduleType: 'cron' };

describe('/api/schedules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserScopedDb).mockResolvedValue({ db, userId: 'user-1' } as never);
    vi.mocked(getNeonDb).mockReturnValue(quotaDb as never);
    quotaDb.query.mockResolvedValue([]);
    vi.mocked(listSchedules).mockResolvedValue([schedule] as never);
    vi.mocked(createSchedule).mockResolvedValue(schedule as never);
    vi.mocked(assertScheduleQuota).mockResolvedValue(undefined);
    vi.mocked(SubscriptionService.getSubscription).mockResolvedValue({
      plan_tier: 'pro',
      status: 'active',
    } as never);
  });

  it('lists the authenticated owner schedules with bounded pagination', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/schedules?limit=500&offset=-2'),
    );
    expect(response.status).toBe(200);
    expect(listSchedules).toHaveBeenCalledWith(db, 'user-1', {
      limit: 100,
      offset: 0,
      projectId: null,
    });
  });

  it('forwards the requested project to the schedule listing', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/schedules?projectId=project-7'),
    );

    expect(response.status).toBe(200);
    expect(listSchedules).toHaveBeenCalledWith(
      db,
      'user-1',
      expect.objectContaining({ projectId: 'project-7' }),
    );
  });

  it('returns 401 when user-scoped authentication fails', async () => {
    vi.mocked(getUserScopedDb).mockRejectedValueOnce(createError.unauthorized());
    const response = await GET(new NextRequest('http://localhost/api/schedules'));
    expect(response.status).toBe(401);
    expect(listSchedules).not.toHaveBeenCalled();
  });

  it('creates through the canonical service after auth and CSRF', async () => {
    const body = {
      name: 'Daily briefing',
      prompt: 'Brief me',
      recurrence: 'daily',
      timeOfDay: '09:00',
      timezone: 'UTC',
    };
    const response = await POST(
      new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    expect(response.status).toBe(201);
    expect(tx.execute).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), [
      'scheduled_tasks:user-1',
    ]);
    expect(assertScheduleQuota).toHaveBeenCalledWith(tx, 'user-1', 'pro');
    expect(createSchedule).toHaveBeenCalledWith(tx, 'user-1', body, { planTier: 'pro' });
  });

  it('holds a lapsed Pro subscription to the Free schedule allowance', async () => {
    vi.mocked(SubscriptionService.getSubscription).mockResolvedValueOnce({
      plan_tier: 'pro',
      status: 'canceled',
    } as never);
    vi.mocked(assertScheduleQuota).mockRejectedValueOnce(
      new ScheduleLimitError('Free plans do not include scheduled tasks.', 'free', 0),
    );

    const response = await POST(
      new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Daily briefing', prompt: 'Brief me' }),
      }),
    );

    expect(response.status).toBe(403);
    expect(assertScheduleQuota).toHaveBeenCalledWith(db, 'user-1', 'free');
    expect(createSchedule).not.toHaveBeenCalled();
  });

  it('refuses to arm another unattended run past the plan ceiling', async () => {
    vi.mocked(assertScheduleQuota).mockRejectedValueOnce(
      new ScheduleLimitError('Free plans do not include scheduled tasks.', 'free', 0),
    );

    const response = await POST(
      new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Daily briefing', prompt: 'Brief me' }),
      }),
    );

    expect(response.status).toBe(403);
    expect(createSchedule).not.toHaveBeenCalled();
  });

  it('returns the canonical plan-limit message before the workspace feature gate for Free', async () => {
    vi.mocked(SubscriptionService.getSubscription).mockResolvedValueOnce({
      plan_tier: 'free',
      status: 'active',
    } as never);
    vi.mocked(assertScheduleQuota).mockRejectedValueOnce(
      new ScheduleLimitError(
        'Free plans do not include scheduled tasks. Upgrade to schedule unattended runs.',
        'free',
        0,
      ),
    );

    const response = await POST(
      new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Daily briefing', prompt: 'Brief me' }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Free plans do not include scheduled tasks. Upgrade to schedule unattended runs.',
        details: {
          code: 'schedules_not_in_plan',
          limit: 0,
          recovery: { action: 'upgrade' },
        },
      },
    });
    expect(assertScheduleQuota).toHaveBeenCalledWith(db, 'user-1', 'free');
    expect(createSchedule).not.toHaveBeenCalled();
  });

  it('tells a paid plan at its ceiling apart from a plan without schedules', async () => {
    vi.mocked(assertScheduleQuota).mockRejectedValueOnce(
      new ScheduleLimitError('This plan can have up to 5 scheduled tasks.', 'pro', 5),
    );

    const response = await POST(
      new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Daily briefing', prompt: 'Brief me' }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'SUBSCRIPTION_REQUIRED',
        details: { code: 'schedule_limit_reached', limit: 5 },
      },
    });
  });

  it('asks the workspace policy about the client the credential is bound to, on read', async () => {
    vi.mocked(getUserScopedDb).mockResolvedValueOnce({
      db,
      userId: 'user-1',
      surface: 'chrome',
    } as never);
    gate.access.mockResolvedValueOnce(
      NextResponse.json(
        { error: { type: 'organization_policy', code: 'surface_not_allowed', message: 'No.' } },
        { status: 403 },
      ),
    );

    const response = await GET(new NextRequest('http://localhost/api/schedules'));

    expect(response.status).toBe(403);
    expect(gate.access).toHaveBeenCalledWith('user-1', expect.any(NextRequest), 'chrome');
    expect(listSchedules).not.toHaveBeenCalled();
  });

  it('asks the workspace feature policy about the bound client, not an unknown one, on create', async () => {
    vi.mocked(getUserScopedDb).mockResolvedValueOnce({
      db,
      userId: 'user-1',
      surface: 'vscode',
    } as never);
    gate.feature.mockResolvedValueOnce(
      NextResponse.json(
        { error: { type: 'organization_policy', code: 'surface_not_allowed', message: 'No.' } },
        { status: 403 },
      ),
    );

    const response = await POST(
      new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Daily briefing', prompt: 'Brief me' }),
      }),
    );

    expect(response.status).toBe(403);
    expect(gate.feature).toHaveBeenCalledWith(
      'user-1',
      expect.any(NextRequest),
      'schedules',
      'vscode',
    );
    expect(createSchedule).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed JSON', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/schedules', { method: 'POST', body: '{' }),
    );
    expect(response.status).toBe(400);
  });

  it('maps domain validation failures to 400', async () => {
    vi.mocked(createSchedule).mockRejectedValueOnce(new ScheduleValidationError('Invalid cron'));
    const response = await POST(
      new NextRequest('http://localhost/api/schedules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Bad' }),
      }),
    );
    expect(response.status).toBe(400);
  });
});
