import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(() => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(() => null) }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: vi.fn() }));
vi.mock('@/lib/services/schedule-service', () => ({
  ScheduleConflictError: class ScheduleConflictError extends Error {},
  ScheduleNotFoundError: class ScheduleNotFoundError extends Error {},
  ScheduleValidationError: class ScheduleValidationError extends Error {},
  createManualScheduleRun: vi.fn(),
  listScheduleRuns: vi.fn(),
  mapScheduleRun: (row: unknown) => row,
  processClaimedScheduleRun: vi.fn(),
}));
vi.mock('@/lib/services/scheduled-agent-executor', () => ({ executeScheduledAgent: vi.fn() }));

import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  ScheduleNotFoundError,
  createManualScheduleRun,
  listScheduleRuns,
  processClaimedScheduleRun,
} from '@/lib/services/schedule-service';
import { GET, POST } from '@/app/api/schedules/[id]/runs/route';

const db = { query: vi.fn() };
const context = { params: Promise.resolve({ id: 'task-1' }) };

describe('/api/schedules/[id]/runs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserScopedDb).mockResolvedValue({ db, userId: 'user-1' } as never);
    vi.mocked(listScheduleRuns).mockResolvedValue([]);
  });

  it('clamps pagination and delegates history through the owner-scoped service', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/schedules/task-1/runs?limit=500&offset=-3'),
      context,
    );
    expect(response.status).toBe(200);
    expect(listScheduleRuns).toHaveBeenCalledWith(db, 'user-1', 'task-1', {
      limit: 100,
      offset: 0,
    });
  });

  it('does not disclose a cross-user schedule', async () => {
    vi.mocked(listScheduleRuns).mockRejectedValueOnce(new ScheduleNotFoundError('not found'));
    const response = await GET(
      new NextRequest('http://localhost/api/schedules/task-1/runs'),
      context,
    );
    expect(response.status).toBe(404);
  });

  it('requires a caller idempotency key before executing a manual run', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/schedules/task-1/runs', { method: 'POST' }),
      context,
    );
    expect(response.status).toBe(400);
    expect(createManualScheduleRun).not.toHaveBeenCalled();
  });

  it('maps a malformed caller idempotency key to a validation response', async () => {
    const { ScheduleValidationError } = await import('@/lib/services/schedule-service');
    vi.mocked(createManualScheduleRun).mockRejectedValueOnce(
      new ScheduleValidationError('Idempotency-Key must be URL-safe'),
    );

    const response = await POST(
      new NextRequest('http://localhost/api/schedules/task-1/runs', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'bad key!' },
      }),
      context,
    );
    expect(response.status).toBe(400);
  });

  it('returns the terminal run after executing a newly claimed manual occurrence', async () => {
    const claimed = { runId: 'run-1', task: { id: 'task-1' } };
    vi.mocked(createManualScheduleRun).mockResolvedValue({
      claim: claimed,
      replay: false,
    } as never);
    vi.mocked(processClaimedScheduleRun).mockResolvedValue({
      id: 'run-1',
      taskId: 'task-1',
      status: 'success',
    } as never);

    const response = await POST(
      new NextRequest('http://localhost/api/schedules/task-1/runs', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'request-12345678' },
      }),
      context,
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ run: { status: 'success' } });
  });

  it('replays a completed manual occurrence without executing it twice', async () => {
    vi.mocked(createManualScheduleRun).mockResolvedValue({
      replay: true,
      run: { id: 'run-1', status: 'success' },
    } as never);

    const response = await POST(
      new NextRequest('http://localhost/api/schedules/task-1/runs', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'request-12345678' },
      }),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ replay: true });
    expect(processClaimedScheduleRun).not.toHaveBeenCalled();
  });

  it('reports an in-progress idempotent replay as a conflict', async () => {
    vi.mocked(createManualScheduleRun).mockResolvedValue({
      replay: true,
      run: { id: 'run-1', status: 'running' },
    } as never);

    const response = await POST(
      new NextRequest('http://localhost/api/schedules/task-1/runs', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'request-12345678' },
      }),
      context,
    );

    expect(response.status).toBe(409);
    expect(processClaimedScheduleRun).not.toHaveBeenCalled();
  });
});
