import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createManagedCloudRequestContext: vi.fn(),
  fetch: vi.fn(),
  getHeaders: vi.fn(),
}));

vi.mock('../../api/config', () => ({ WEB_APP_URL: 'https://cloud.example.test' }));
vi.mock('../managedCloudRequestContext', () => ({
  createManagedCloudRequestContext: mocks.createManagedCloudRequestContext,
}));

import { createDesktopManagedCloudSettingsClient } from '../managedCloudSettingsSync';

describe('Desktop Managed Cloud settings transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getHeaders.mockResolvedValue({ Authorization: 'Bearer live-account-token' });
    mocks.fetch.mockImplementation(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      if (init?.method === 'GET') {
        return new Response(JSON.stringify({ settings: {}, cursor: '0', hasMore: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ applied: true, cursor: '1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected settings request: ${init?.method} ${url.pathname}`);
    });
    mocks.createManagedCloudRequestContext.mockReturnValue({
      fetch: mocks.fetch,
      getHeaders: mocks.getHeaders,
    });
  });

  it('constructs an account-pinned client per operation and sends the live bearer', async () => {
    const client = createDesktopManagedCloudSettingsClient();

    await expect(client.pull('0')).resolves.toMatchObject({ cursor: '0' });
    await expect(
      client.push({ settings: { appearance: { theme: 'dark' } }, baseVersion: '0' }),
    ).resolves.toMatchObject({ applied: true, cursor: '1' });

    expect(mocks.createManagedCloudRequestContext).toHaveBeenNthCalledWith(
      1,
      'Managed Cloud settings pull',
    );
    expect(mocks.createManagedCloudRequestContext).toHaveBeenNthCalledWith(
      2,
      'Managed Cloud settings push',
    );
    expect(mocks.getHeaders).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    for (const [, init] of mocks.fetch.mock.calls as Array<[string, RequestInit]>) {
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer live-account-token');
      expect(init.credentials).toBe('include');
    }
  });

  it('does not reach transport when the boundary changes during header resolution', async () => {
    mocks.getHeaders.mockRejectedValueOnce(
      new Error('The Managed Cloud account changed while this request was in progress.'),
    );
    const client = createDesktopManagedCloudSettingsClient();

    await expect(client.pull('0', { maxAttempts: 1 })).rejects.toThrow('account changed');

    expect(mocks.createManagedCloudRequestContext).toHaveBeenCalledOnce();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
