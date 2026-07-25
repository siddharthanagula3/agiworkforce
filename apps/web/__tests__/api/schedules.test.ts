import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(() => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(() => null) }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: vi.fn() }));
vi.mock('@/lib/services/schedule-service', () => ({
  ScheduleConflictError: class ScheduleConflictError extends Error {},
  ScheduleLimitError: class ScheduleLimitError extends Error {},
  ScheduleNotFoundError: class ScheduleNotFoundError extends Error {},
  ScheduleValidationError: class ScheduleValidationError extends Error {},
  assertScheduleQuota: vi.fn(),
  createSchedule: vi.fn(),
  listSchedules: vi.fn(),
}));
// GOV-8: POST now resolves the caller's plan tier and asserts the per-plan
// scheduled-task ceiling before persisting.
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: vi.fn() },
}));

import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  ScheduleLimitError,
  ScheduleValidationError,
  assertScheduleQuota,
  createSchedule,
  listSchedules,
} from '@/lib/services/schedule-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { GET, POST } from '@/app/api/schedules/route';

const db = { query: vi.fn() };
const schedule = { id: 'task-1', userId: 'user-1', scheduleType: 'cron' };

describe('/api/schedules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserScopedDb).mockResolvedValue({ db, userId: 'user-1' } as never);
    vi.mocked(listSchedules).mockResolvedValue([schedule] as never);
    vi.mocked(createSchedule).mockResolvedValue(schedule as never);
    vi.mocked(assertScheduleQuota).mockResolvedValue(undefined);
    vi.mocked(SubscriptionService.getSubscription).mockResolvedValue({
      plan_tier: 'pro',
    } as never);
  });

  it('lists the authenticated owner schedules with bounded pagination', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/schedules?limit=500&offset=-2'),
    );
    expect(response.status).toBe(200);
    expect(listSchedules).toHaveBeenCalledWith(db, 'user-1', { limit: 100, offset: 0 });
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
    expect(assertScheduleQuota).toHaveBeenCalledWith(db, 'user-1', 'pro');
    expect(createSchedule).toHaveBeenCalledWith(db, 'user-1', body);
  });

  // GOV-8: an over-quota schedule is an entitlement refusal (403) with an
  // upgrade path, and must never reach persistence.
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
