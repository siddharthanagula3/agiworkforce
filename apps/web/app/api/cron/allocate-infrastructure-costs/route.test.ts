import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/logger');
type ScanModule1 = typeof import('@/lib/server/cron-auth');
type ScanModule2 = typeof import('@/lib/services/infrastructure-allocation-service');

const { mockVerifyCron, mockAllocate, mockLogger } = vi.hoisted(() => ({
  mockVerifyCron: vi.fn(),
  mockAllocate: vi.fn(),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  logger: mockLogger,
}));
vi.mock('@/lib/server/cron-auth', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  verifyCronRequest: mockVerifyCron,
}));
vi.mock('@/lib/services/infrastructure-allocation-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  allocateInfrastructureCosts: mockAllocate,
}));

import { GET } from './route';

const RUN = {
  billingMonth: '2026-08-01',
  activeAccounts: 120,
  estimated: ['sentry'],
  missing: [],
  allocated: [
    {
      vendor: 'vercel',
      billingMonth: '2026-08-01',
      source: 'invoice',
      billMicrousd: 20_000_000,
      attributedMicrousd: 4_000_000,
      allocatedMicrousd: 16_000_000,
      activeAccounts: 120,
    },
  ],
  failed: [],
};

function cronRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/cron/allocate-infrastructure-costs');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCron.mockReturnValue(true);
  mockAllocate.mockResolvedValue(RUN);
});

describe('GET /api/cron/allocate-infrastructure-costs', () => {
  it('refuses a request that is not the scheduler and allocates nothing', async () => {
    mockVerifyCron.mockReturnValue(false);

    const response = await GET(cronRequest());

    expect(response.status).toBe(401);
    expect(mockAllocate).not.toHaveBeenCalled();
  });

  it('allocates the month before now and reports the run', async () => {
    const before = Date.now();

    const response = await GET(cronRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(RUN);
    const [now] = mockAllocate.mock.calls[0] as [Date];
    expect(now).toBeInstanceOf(Date);
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('warns about every vendor that has no bill and no committed rate', async () => {
    mockAllocate.mockResolvedValue({ ...RUN, missing: ['clerk', 'upstash'] });

    const response = await GET(cronRequest());

    expect(response.status).toBe(200);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      {
        event: 'infrastructure_bill_missing',
        billingMonth: '2026-08-01',
        vendors: ['clerk', 'upstash'],
      },
      expect.any(String),
    );
  });

  it('answers 500 with the run when any vendor failed to allocate', async () => {
    const failed = [{ vendor: 'neon', billingMonth: '2026-08-01', reason: 'lock timeout' }];
    mockAllocate.mockResolvedValue({ ...RUN, failed });

    const response = await GET(cronRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ failed });
  });

  it('answers 500 without the error text when the allocation throws', async () => {
    mockAllocate.mockRejectedValue(new Error('database unreachable'));

    const response = await GET(cronRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Internal server error' });
    expect(mockLogger.error).toHaveBeenCalledWith(
      { event: 'infrastructure_allocation_run_failed', error: 'database unreachable' },
      expect.any(String),
    );
  });
});
