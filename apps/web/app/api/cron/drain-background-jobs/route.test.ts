import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_DATA_REGION } from '@agiworkforce/compliance';

const mocks = vi.hoisted(() => ({
  db: vi.fn(),
  dispatch: vi.fn(),
  drain: vi.fn(),
  lowPower: vi.fn(),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  getNeonDb: mocks.db,
}));
vi.mock('@/lib/server/project-knowledge-cleanup', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  dispatchProjectKnowledgeCleanup: mocks.dispatch,
}));
vi.mock('@/lib/jobs/job-drain', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  drainBackgroundJobs: mocks.drain,
}));
vi.mock('@/lib/jobs/job-handlers', () => ({ BACKGROUND_JOB_HANDLERS: {} }));
vi.mock('@/lib/server/cron-low-power', () => ({ lowPowerCronSkip: mocks.lowPower }));

import { resetCronAuthThrottleForTests } from '@/lib/server/cron-auth';
import { GET } from './route';

const secret = 'cleanup-cron-fixture-key-with-sufficient-entropy';
const db = {};
const request = (authorization?: string) =>
  new NextRequest('https://cron.example.test/api/cron/drain-background-jobs', {
    headers: authorization === undefined ? {} : { authorization },
  });

beforeEach(() => {
  resetCronAuthThrottleForTests();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('CRON_SECRET', secret);
  vi.stubEnv('CRON_DEV_BYPASS', '');
  mocks.db.mockReturnValue(db);
  mocks.dispatch.mockResolvedValue(0);
  mocks.drain.mockResolvedValue({ drained: true });
  mocks.lowPower.mockReturnValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe('background cleanup cron admission', () => {
  it.each([undefined, 'Bearer wrong', 'Basic wrong'])(
    'refuses %s without admitting database work',
    async (authorization) => {
      expect((await GET(request(authorization))).status).toBe(401);
      expect(mocks.db).not.toHaveBeenCalled();
      expect(mocks.dispatch).not.toHaveBeenCalled();
      expect(mocks.drain).not.toHaveBeenCalled();
    },
  );

  it('honors low-power admission before opening the database', async () => {
    mocks.lowPower.mockReturnValue(NextResponse.json({ skipped: true }));
    expect((await GET(request(`Bearer ${secret}`))).status).toBe(200);
    expect(mocks.db).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it('dispatches the home-region outbox before claiming existing queue work', async () => {
    const order: string[] = [];
    mocks.dispatch.mockImplementation(async () => {
      order.push('dispatch');
      return 1;
    });
    mocks.drain.mockImplementation(async () => {
      order.push('drain');
      return { drained: true };
    });
    expect((await GET(request(`Bearer ${secret}`))).status).toBe(200);
    expect(order).toEqual(['dispatch', 'drain']);
    expect(mocks.dispatch).toHaveBeenCalledWith(db, { region: DEFAULT_DATA_REGION });
    expect(mocks.drain).toHaveBeenCalledWith(expect.objectContaining({ db }));
  });

  it('drains only the region whose database it is connected to', async () => {
    expect((await GET(request(`Bearer ${secret}`))).status).toBe(200);
    expect(mocks.drain).toHaveBeenCalledWith(
      expect.objectContaining({ region: DEFAULT_DATA_REGION }),
    );
  });

  it('reports a dispatch failure without claiming jobs or exposing internal details', async () => {
    mocks.dispatch.mockRejectedValue(new Error('fixture-private-storage-detail'));
    const response = await GET(request(`Bearer ${secret}`));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('fixture-private-storage-detail');
    expect(mocks.drain).not.toHaveBeenCalled();
  });
});
