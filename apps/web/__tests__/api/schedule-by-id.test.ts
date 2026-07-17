import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(() => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(() => null) }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: vi.fn() }));
vi.mock('@/lib/services/schedule-service', () => ({
  ScheduleConflictError: class ScheduleConflictError extends Error {},
  ScheduleNotFoundError: class ScheduleNotFoundError extends Error {},
  ScheduleValidationError: class ScheduleValidationError extends Error {},
  deleteSchedule: vi.fn(),
  getSchedule: vi.fn(),
  setScheduleEnabled: vi.fn(),
  updateSchedule: vi.fn(),
}));

import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  ScheduleNotFoundError,
  deleteSchedule,
  getSchedule,
  setScheduleEnabled,
  updateSchedule,
} from '@/lib/services/schedule-service';
import { DELETE, GET, PATCH, PUT } from '@/app/api/schedules/[id]/route';

const db = { query: vi.fn() };
const context = { params: Promise.resolve({ id: 'task-1' }) };
const schedule = { id: 'task-1', userId: 'user-1' };

describe('/api/schedules/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserScopedDb).mockResolvedValue({ db, userId: 'user-1' } as never);
    vi.mocked(getSchedule).mockResolvedValue(schedule as never);
    vi.mocked(updateSchedule).mockResolvedValue(schedule as never);
    vi.mocked(setScheduleEnabled).mockResolvedValue(schedule as never);
    vi.mocked(deleteSchedule).mockResolvedValue();
  });

  it('loads through an owner-scoped lookup', async () => {
    const response = await GET(new NextRequest('http://localhost/api/schedules/task-1'), context);
    expect(response.status).toBe(200);
    expect(getSchedule).toHaveBeenCalledWith(db, 'user-1', 'task-1');
  });

  it('does not disclose another user task', async () => {
    vi.mocked(getSchedule).mockRejectedValueOnce(new ScheduleNotFoundError('not found'));
    const response = await GET(new NextRequest('http://localhost/api/schedules/task-1'), context);
    expect(response.status).toBe(404);
  });

  it('updates through the canonical service', async () => {
    const response = await PUT(
      new NextRequest('http://localhost/api/schedules/task-1', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(updateSchedule).toHaveBeenCalledWith(db, 'user-1', 'task-1', { name: 'Updated' });
  });

  it('requires a boolean isActive toggle', async () => {
    const response = await PATCH(
      new NextRequest('http://localhost/api/schedules/task-1', {
        method: 'PATCH',
        body: JSON.stringify({ isActive: 'yes' }),
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(setScheduleEnabled).not.toHaveBeenCalled();
  });

  it('deletes only through an owner predicate', async () => {
    const response = await DELETE(
      new NextRequest('http://localhost/api/schedules/task-1', { method: 'DELETE' }),
      context,
    );
    expect(response.status).toBe(200);
    expect(deleteSchedule).toHaveBeenCalledWith(db, 'user-1', 'task-1');
  });
});
