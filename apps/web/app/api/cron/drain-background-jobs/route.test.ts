import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  verifyCronRequest: vi.fn(),
  lowPowerCronSkip: vi.fn(),
  getNeonDb: vi.fn(),
  drainBackgroundJobs: vi.fn(),
}));

vi.mock('@/lib/server/cron-auth', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule3>()),
  verifyCronRequest: mocks.verifyCronRequest,
}));
vi.mock('@/lib/server/cron-low-power', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule2>()),
  lowPowerCronSkip: mocks.lowPowerCronSkip,
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  getNeonDb: mocks.getNeonDb,
}));
vi.mock('@/lib/jobs/job-drain', () => ({ drainBackgroundJobs: mocks.drainBackgroundJobs }));
vi.mock('@/lib/jobs/job-handlers', () => ({ BACKGROUND_JOB_HANDLERS: {} }));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { DEFAULT_DATA_REGION } from '@agiworkforce/compliance';

import { GET } from './route';

function req() {
  return new Request('http://localhost/api/cron/drain-background-jobs') as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyCronRequest.mockReturnValue(true);
  mocks.lowPowerCronSkip.mockReturnValue(null);
  mocks.getNeonDb.mockReturnValue({});
  mocks.drainBackgroundJobs.mockResolvedValue({ drained: true });
});

describe('GET /api/cron/drain-background-jobs', () => {
  it('drains only the region whose database it is connected to', async () => {
    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(mocks.drainBackgroundJobs).toHaveBeenCalledWith(
      expect.objectContaining({ region: DEFAULT_DATA_REGION }),
    );
  });

  it('refuses a request without cron authorization', async () => {
    mocks.verifyCronRequest.mockReturnValue(false);

    const response = await GET(req());

    expect(response.status).toBe(401);
    expect(mocks.drainBackgroundJobs).not.toHaveBeenCalled();
  });
});

type ImportedModule3 = typeof import('@/lib/server/cron-auth');
type ImportedModule2 = typeof import('@/lib/server/cron-low-power');
type ImportedModule1 = typeof import('@/lib/server/neon-db');
type ImportedModule0 = typeof import('@/lib/logger');
