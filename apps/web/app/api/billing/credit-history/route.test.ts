import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockGetUserScopedDb, mockQuery } = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockQuery: vi.fn(),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mockGetUserScopedDb(...args),
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { GET } from './route';
import { MfaRequiredError } from '@/lib/mfa-policy-gate';
import { listCanonicalModels } from '@agiworkforce/types';

function req(url = 'http://localhost:3000/api/billing/credit-history') {
  return new Request(url) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: mockQuery },
    userId: 'user-1',
    organizationId: null,
  });
});

describe('GET /api/billing/credit-history', () => {
  it('scopes the ledger query to the caller through the rls-scoped connection', async () => {
    mockQuery.mockResolvedValue([
      {
        id: 'tx-1',
        transaction_type: 'purchase',
        amount_cents: 1000,
        description: null,
        metadata: null,
        created_at: '2026-06-01T00:00:00.000Z',
      },
    ]);

    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(mockGetUserScopedDb).toHaveBeenCalledWith(expect.anything());
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['user-1', 50, 0]);
    const body = (await response.json()) as { transactions: unknown[]; has_more: boolean };
    expect(body.transactions).toHaveLength(1);
    expect(body.has_more).toBe(false);
  });

  it('labels a usage debit by the model and hides the route it was reserved against', async () => {
    const model = listCanonicalModels()[0];
    if (!model) throw new Error('The registry must list a canonical model');
    mockQuery.mockResolvedValue([
      {
        id: 'tx-2',
        transaction_type: 'deduction',
        amount_cents: 3,
        description: `Managed usage reservation: ${model.provider}/${model.id}`,
        metadata: null,
        created_at: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 'tx-3',
        transaction_type: 'deduction',
        amount_cents: 1,
        description: 'Managed usage actual-cost reconciliation',
        metadata: null,
        created_at: '2026-06-01T00:00:01.000Z',
      },
      {
        id: 'tx-4',
        transaction_type: 'purchase',
        amount_cents: 1000,
        description: null,
        metadata: null,
        created_at: '2026-06-01T00:00:02.000Z',
      },
    ]);

    const response = await GET(req());
    const body = (await response.json()) as { transactions: Array<{ label: string | null }> };

    expect(body.transactions.map((row) => row.label)).toEqual([
      `Usage: ${model.name}`,
      'Usage adjustment',
      null,
    ]);
  });

  it('rejects when authentication fails', async () => {
    mockGetUserScopedDb.mockRejectedValue(new Error('unauthorized'));

    const response = await GET(req());

    expect(response.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('surfaces an mfa policy denial as a 403 instead of a generic 401', async () => {
    mockGetUserScopedDb.mockRejectedValue(
      new MfaRequiredError('Your workspace requires two-factor authentication.'),
    );

    const response = await GET(req());

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('MFA_REQUIRED');
    expect(body.error.message).toBe('Your workspace requires two-factor authentication.');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('states every row in credits and names what it was spent on', async () => {
    const model = listCanonicalModels()[0];
    if (!model) throw new Error('The registry must list a canonical model');
    mockQuery.mockResolvedValue([
      {
        id: 'tx-2',
        transaction_type: 'deduction',
        amount_cents: -3,
        description: `Managed usage reservation: openai/${model.id}`,
        metadata: {
          quotaFeature: 'chat',
          reservedModel: model.id,
          servedProvider: 'a-gateway',
          servedModel: 'a-route-model',
        },
        created_at: '2026-06-02T00:00:00.000Z',
      },
      {
        id: 'tx-3',
        transaction_type: 'purchase',
        amount_cents: 1000,
        description: null,
        metadata: null,
        created_at: '2026-06-01T00:00:00.000Z',
      },
    ]);

    const response = await GET(req());
    const body = (await response.json()) as {
      transactions: { credits: number; feature: string | null; model: string | null }[];
    };

    expect(body.transactions[0]?.credits).toBe(-1.5);
    expect(body.transactions[0]?.feature).toBe('chat');
    expect(body.transactions[0]?.model).toBe(model.name);
    expect(body.transactions[1]?.credits).toBe(500);
    expect(body.transactions[1]?.feature).toBeNull();
    expect(JSON.stringify(body)).not.toContain('a-gateway');
    expect(JSON.stringify(body)).not.toContain('a-route-model');
  });
});
