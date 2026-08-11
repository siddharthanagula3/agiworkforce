import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockExecute, mockTransaction } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1' })),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({ transaction: mockTransaction })),
}));

import { PUT } from './route';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

function request(organizationId: unknown) {
  return new Request('http://localhost:3000/api/settings/organization/active', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationId }),
  }) as never;
}

describe('PUT /api/settings/organization/active', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ query: mockQuery, execute: mockExecute }),
    );
  });

  it('persists an exact membership-owned organization selection', async () => {
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }]);

    const response = await PUT(request(ORGANIZATION_ID));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      activeOrganizationId: ORGANIZATION_ID,
      scope: 'organization',
    });
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.user_settings'),
      ['user-1', ORGANIZATION_ID],
    );
  });

  it('rejects a selection outside the authenticated account memberships', async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const response = await PUT(request(ORGANIZATION_ID));

    expect(response.status).toBe(403);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('switches to Personal without requiring an organization membership', async () => {
    mockQuery.mockResolvedValueOnce([]);

    const response = await PUT(request(null));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      activeOrganizationId: null,
      scope: 'personal',
    });
    expect(mockExecute).toHaveBeenCalledWith(expect.any(String), ['user-1', 'personal']);
  });

  it('rejects malformed workspace identifiers before opening a transaction', async () => {
    const response = await PUT(request('not-a-workspace-id'));

    expect(response.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
