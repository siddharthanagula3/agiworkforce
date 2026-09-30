import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({
  REDIS_OUTAGE_POLICY_ENV: vi.fn(),
  acquireManagedTurnSlot: vi.fn(),
  checkRateLimit: vi.fn(),
  clientIpRateLimitIdentifier: vi.fn(),
  getClientIpForRateLimit: vi.fn(),
  isSharedStoreQuotaExhausted: vi.fn(),
  rateLimitConfigs: vi.fn(),
  readManagedTurnSlots: vi.fn(),
  resolveRedisOutagePolicy: vi.fn(),
  resolveTierRateLimit: vi.fn(),
  withRateLimitHandler: vi.fn(),
  withRateLimit: vi.fn(() => null),
}));
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: vi.fn(),
}));
vi.mock('@/lib/services/schedule-service', () => ({
  ScheduleConflictError: vi.fn(),
  ScheduleLimitError: vi.fn(),
  ScheduleNotFoundError: vi.fn(),
  ScheduleValidationError: vi.fn(),
  UNATTENDED_RUN_DENIED_STATUSES: vi.fn(),
  assertProjectOwnership: vi.fn(),
  assertScheduleQuota: vi.fn(),
  claimDueScheduleRuns: vi.fn(),
  claimScheduleRunApproval: vi.fn(),
  countSchedules: vi.fn(),
  createEventTriggeredScheduleRun: vi.fn(),
  createManualScheduleRun: vi.fn(),
  createSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  detectMissedExecution: vi.fn(),
  finalizeScheduleRun: vi.fn(),
  getSchedule: vi.fn(),
  listScheduleRuns: vi.fn(),
  listSchedules: vi.fn(),
  mapScheduleRun: vi.fn(),
  mapScheduleTask: vi.fn(),
  processClaimedScheduleRun: vi.fn(),
  processDueScheduleRuns: vi.fn(),
  retryDelaySeconds: vi.fn(),
  setScheduleEnabled: vi.fn(),
  updateSchedule: vi.fn(),
  listRecentScheduleRuns: vi.fn(),
}));

import { encodeKeysetCursor } from '@/lib/identity/pagination';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { listRecentScheduleRuns } from '@/lib/services/schedule-service';
import { GET } from '@/app/api/schedules/runs/route';

const db = { query: vi.fn() };
const RUN_ID = '44444444-4444-4444-8444-444444444444';

describe('/api/schedules/runs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUserScopedDb).mockResolvedValue({ db, userId: 'user-1' } as never);
    vi.mocked(listRecentScheduleRuns).mockResolvedValue({ runs: [], nextCursor: 'next-page' });
  });

  it('reads the first page without a cursor and returns the next one', async () => {
    const response = await GET(new NextRequest('http://localhost/api/schedules/runs?limit=500'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ runs: [], nextCursor: 'next-page' });
    expect(listRecentScheduleRuns).toHaveBeenCalledWith(db, 'user-1', {
      limit: 100,
      cursor: null,
    });
  });

  it('continues after the cursor the previous page returned', async () => {
    const cursor = { sortValue: '2026-07-15T12:00:02.000000Z', id: RUN_ID };
    const response = await GET(
      new NextRequest(
        `http://localhost/api/schedules/runs?limit=20&cursor=${encodeKeysetCursor(cursor)}`,
      ),
    );
    expect(response.status).toBe(200);
    expect(listRecentScheduleRuns).toHaveBeenCalledWith(db, 'user-1', { limit: 20, cursor });
  });

  it('refuses a cursor it did not issue', async () => {
    const forged = encodeKeysetCursor({ sortValue: 'yesterday', id: RUN_ID });
    const response = await GET(
      new NextRequest(`http://localhost/api/schedules/runs?cursor=${forged}`),
    );
    expect(response.status).toBe(400);
    expect(listRecentScheduleRuns).not.toHaveBeenCalled();
  });
});
