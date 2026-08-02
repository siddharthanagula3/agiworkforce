import { beforeEach, describe, expect, it, vi } from 'vitest';

const { assertBoundary, createManagedCloudRequestContext, fetch, getHeaders } = vi.hoisted(() => ({
  assertBoundary: vi.fn(),
  createManagedCloudRequestContext: vi.fn(),
  fetch: vi.fn(),
  getHeaders: vi.fn(),
}));

vi.mock('../managedCloudRequestContext', () => ({ createManagedCloudRequestContext }));

import { desktopCloudSchedules } from '../desktopCloudSchedules';

describe('desktopCloudSchedules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHeaders.mockResolvedValue({ Authorization: 'Bearer rotated-account-token' });
    fetch.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            schedules: [],
            pagination: { limit: 25, offset: 0 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    createManagedCloudRequestContext.mockReturnValue({
      assertBoundary,
      fetch,
      getHeaders,
    });
  });

  it('sends the account bearer and rechecks the captured operation boundary', async () => {
    await expect(desktopCloudSchedules.listSchedules({ limit: 25, offset: 0 })).resolves.toEqual({
      schedules: [],
      pagination: { limit: 25, offset: 0 },
      hasMore: false,
    });

    expect(createManagedCloudRequestContext).toHaveBeenCalledWith('Managed Cloud schedule list');
    expect(getHeaders).toHaveBeenCalledOnce();
    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer rotated-account-token');
    expect(init.credentials).toBe('include');
    expect(assertBoundary).toHaveBeenCalledOnce();
  });

  it('captures a fresh request context for every schedule operation', async () => {
    await desktopCloudSchedules.listSchedules({ limit: 25, offset: 0 });
    await desktopCloudSchedules.listSchedules({ limit: 25, offset: 0 });

    expect(createManagedCloudRequestContext).toHaveBeenCalledTimes(2);
  });
});
