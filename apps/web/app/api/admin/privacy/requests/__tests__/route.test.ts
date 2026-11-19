import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  count: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/auth-guards', () => ({ requirePlatformAdmin: vi.fn(async () => undefined) }));
vi.mock('@/lib/server/data-rights-requests', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  readOpenDataRightsRequests: mocks.read,
  countOpenDataRightsRequests: mocks.count,
}));

import { GET } from '../route';

function call(query = '') {
  return GET(new NextRequest(`https://app.test/api/admin/privacy/requests${query}`));
}

describe('GET /api/admin/privacy/requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue([{ reference: 'DPDP-AAAAAAAAAA' }]);
    mocks.count.mockResolvedValue(250);
  });

  it('reports the real backlog and that more remain beyond the window', async () => {
    const response = await call();
    const body = await response.json();

    expect(body).toMatchObject({ count: 1, total: 250, hasMore: true });
    expect(mocks.read).toHaveBeenCalledWith(100, expect.any(Date), 0);
  });

  it('reads a later window from the offset', async () => {
    mocks.read.mockResolvedValue(
      Array.from({ length: 50 }, (_, index) => ({ reference: `R${index}` })),
    );

    const response = await call('?offset=200');
    const body = await response.json();

    expect(mocks.read).toHaveBeenCalledWith(100, expect.any(Date), 200);
    expect(body).toMatchObject({ count: 50, total: 250, hasMore: false });
  });

  it('rejects a negative offset', async () => {
    const response = await call('?offset=-1');

    expect(response.status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});

type ImportedModule1 = typeof import('@/lib/rate-limit');
type ImportedModule0 = typeof import('@/lib/server/data-rights-requests');
