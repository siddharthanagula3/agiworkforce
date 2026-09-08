import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockVerifyCron, mockGetNeonDb, mockProcessPendingSettlements, mockLogger } = vi.hoisted(
  () => ({
    mockVerifyCron: vi.fn(),
    mockGetNeonDb: vi.fn(),
    mockProcessPendingSettlements: vi.fn(),
    mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  }),
);

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({ logger: mockLogger }));
vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mockVerifyCron }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: mockGetNeonDb }));
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: { processPendingSettlements: mockProcessPendingSettlements },
}));

import { GET } from './route';

function cronRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/cron/recover-reservations');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCron.mockReturnValue(true);
  mockGetNeonDb.mockReturnValue({ query: vi.fn() });
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
    });
  });

  it('asks for the whole batch the SQL will allow, not the default of 100', async () => {
    await GET(cronRequest());
    expect(mockProcessPendingSettlements).toHaveBeenCalledWith(500, expect.anything());
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
  });

  it('answers 500 rather than reporting a sweep that did not happen', async () => {
    mockProcessPendingSettlements.mockRejectedValue(new Error('database unreachable'));
    const response = await GET(cronRequest());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
  });
});
