import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/services/free-trial-service');

const {
  mockVerifyCron,
  mockGetNeonDb,
  mockProcessPendingSettlements,
  mockReleaseExpiredFree,
  mockLogger,
} = vi.hoisted(() => ({
  mockVerifyCron: vi.fn(),
  mockGetNeonDb: vi.fn(),
  mockProcessPendingSettlements: vi.fn(),
  mockReleaseExpiredFree: vi.fn(),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({ logger: mockLogger }));
vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mockVerifyCron }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: mockGetNeonDb }));
vi.mock('@/lib/services/credit-service', () => ({
  MICROUSD_PER_LEDGER_CENT: 10_000,
  microusdFromLedgerCents: (cents: number) => Math.round(cents) * 10_000,
  ledgerCentsFromMicrousd: (microusd: number) => Math.floor((microusd + 5_000) / 10_000),

  CreditService: { processPendingSettlements: mockProcessPendingSettlements },
}));
vi.mock('@/lib/services/free-trial-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  releaseExpiredFreeTrialReservations: mockReleaseExpiredFree,
}));

import { GET } from './route';

function cronRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/cron/recover-reservations');
}

const SERVICE_DB = { query: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCron.mockReturnValue(true);
  mockGetNeonDb.mockReturnValue(SERVICE_DB);
  mockReleaseExpiredFree.mockResolvedValue({ released: 0, absorbedMicrousd: 0 });
  mockProcessPendingSettlements.mockResolvedValue({
    processed: 3,
    succeeded: 3,
    pending: 0,
    terminal: 0,
  });
});

describe('GET /api/cron/recover-reservations', () => {
  it('drains stranded reservations and reports what it settled', async () => {
    const response = await GET(cronRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      processed: 3,
      succeeded: 3,
      pending: 0,
      terminal: 0,
      free: { released: 0, absorbedMicrousd: 0 },
    });
  });

  it('asks for the whole batch the SQL will allow, not the default of 100', async () => {
    await GET(cronRequest());
    expect(mockProcessPendingSettlements).toHaveBeenCalledWith(500, SERVICE_DB);
    expect(mockReleaseExpiredFree).toHaveBeenCalledWith(SERVICE_DB, 500);
  });

  it('releases Free reservations whose turn lease expired and reports what it absorbed', async () => {
    mockReleaseExpiredFree.mockResolvedValue({ released: 2, absorbedMicrousd: 5_350 });

    const response = await GET(cronRequest());

    await expect(response.json()).resolves.toMatchObject({
      free: { released: 2, absorbedMicrousd: 5_350 },
    });
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'free_usage_reservation_recovery',
        released: 2,
        absorbedMicrousd: 5_350,
      }),
      expect.any(String),
    );
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('says so when the Free sweep fills its batch and leaves a backlog behind', async () => {
    mockReleaseExpiredFree.mockResolvedValue({ released: 500, absorbedMicrousd: 900_000 });

    await GET(cronRequest());

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'free_usage_reservation_recovery_saturated' }),
      expect.any(String),
    );
  });

  it('answers 500 when the Free sweep cannot run', async () => {
    mockReleaseExpiredFree.mockRejectedValue(new Error('database unreachable'));

    const response = await GET(cronRequest());

    expect(response.status).toBe(500);
  });

  it('says so when a sweep fills its batch and leaves a backlog behind', async () => {
    mockProcessPendingSettlements.mockResolvedValue({
      processed: 500,
      succeeded: 500,
      pending: 0,
      terminal: 0,
    });
    await GET(cronRequest());
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'managed_usage_reservation_recovery_saturated' }),
      expect.any(String),
    );
  });

  it('refuses a request that is not the scheduler', async () => {
    mockVerifyCron.mockReturnValue(false);
    const response = await GET(cronRequest());
    expect(response.status).toBe(401);
    expect(mockProcessPendingSettlements).not.toHaveBeenCalled();
    expect(mockReleaseExpiredFree).not.toHaveBeenCalled();
  });

  it('answers 500 rather than reporting a sweep that did not happen', async () => {
    mockProcessPendingSettlements.mockRejectedValue(new Error('database unreachable'));
    const response = await GET(cronRequest());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
  });
});
