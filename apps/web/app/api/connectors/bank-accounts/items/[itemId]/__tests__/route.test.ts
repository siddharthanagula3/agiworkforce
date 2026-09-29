import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRemove, mockSet } = vi.hoisted(() => ({ mockRemove: vi.fn(), mockSet: vi.fn() }));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security-audit')>()),
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({ db: {}, userId: 'user-1', organizationId: null })),
}));
vi.mock('@/lib/connectors/bank-accounts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connectors/bank-accounts')>()),
  removeBankItem: (...args: unknown[]) => mockRemove(...args),
  setBankItemExcludedAccounts: (...args: unknown[]) => mockSet(...args),
}));

import { DELETE, PATCH } from '../route';

const ITEM_ID = '11111111-1111-4111-8111-111111111111';
const context = (itemId = ITEM_ID) => ({ params: Promise.resolve({ itemId }) });
const request = (method: string, body?: unknown) =>
  new Request(`http://localhost:3000/api/connectors/bank-accounts/items/${ITEM_ID}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as never;

describe('/api/connectors/bank-accounts/items/[itemId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes one of the caller's banks", async () => {
    mockRemove.mockResolvedValueOnce(true);
    const res = await DELETE(request('DELETE'), context());
    expect(res.status).toBe(200);
    expect(mockRemove).toHaveBeenCalledWith('user-1', ITEM_ID);
  });

  it('answers not found for a bank the caller does not own', async () => {
    mockRemove.mockResolvedValueOnce(false);
    const res = await DELETE(request('DELETE'), context());
    expect(res.status).toBe(404);
  });

  it('saves which accounts stay out of chats', async () => {
    mockSet.mockResolvedValueOnce('updated');
    const res = await PATCH(request('PATCH', { excludedAccountIds: ['acc-2'] }), context());
    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith('user-1', ITEM_ID, ['acc-2']);
  });

  it('refuses account ids the bank did not return', async () => {
    mockSet.mockResolvedValueOnce('unknown_account');
    const res = await PATCH(request('PATCH', { excludedAccountIds: ['acc-9'] }), context());
    expect(res.status).toBe(400);
  });

  it('answers not found when the bank is not the caller', async () => {
    mockSet.mockResolvedValueOnce('not_found');
    const res = await PATCH(request('PATCH', { excludedAccountIds: [] }), context());
    expect(res.status).toBe(404);
  });

  it('accepts the legacy link id so an older bank can be removed', async () => {
    mockRemove.mockResolvedValueOnce(true);
    const res = await DELETE(request('DELETE'), context('legacy'));
    expect(res.status).toBe(200);
    expect(mockRemove).toHaveBeenCalledWith('user-1', 'legacy');
  });

  it('refuses any other item id before reaching the bank', async () => {
    const res = await DELETE(request('DELETE'), context('not-a-link'));
    expect(res.status).toBe(404);
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
