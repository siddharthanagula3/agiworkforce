import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/connectors/bank-accounts');

const { mockList, mockUnavailable } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockUnavailable: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({ db: {}, userId: 'user-1', organizationId: null })),
}));
vi.mock('@/lib/connectors/bank-accounts', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  listBankItems: (...args: unknown[]) => mockList(...args),
  bankAccountsUnavailableReason: () => mockUnavailable(),
}));

import { GET } from '../route';

const request = () =>
  new Request('http://localhost:3000/api/connectors/bank-accounts/items') as never;

describe('GET /api/connectors/bank-accounts/items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnavailable.mockReturnValue(null);
  });

  it("lists the caller's linked banks", async () => {
    mockList.mockResolvedValueOnce([]);
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith('user-1');
    expect(await res.json()).toEqual({ items: [] });
  });

  it('lists nothing while bank linking is not set up', async () => {
    mockUnavailable.mockReturnValue('Bank accounts are not available.');
    const res = await GET(request());
    expect(await res.json()).toEqual({ items: [] });
    expect(mockList).not.toHaveBeenCalled();
  });
});
