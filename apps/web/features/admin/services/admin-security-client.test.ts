import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAdminSecurityOperations, performAdminAccountAction } from './admin-security-client';

const mocks = vi.hoisted(() => ({ getCsrfToken: vi.fn() }));

vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: mocks.getCsrfToken }));

const mockFetch = vi.fn();

describe('admin security client', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mocks.getCsrfToken.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('loads the live dashboard and event feed with the admin session token', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ metrics: {}, alerts: [], recent_critical: [], top_ips: [] }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ events: [{ id: 'event-1' }] }), { status: 200 }),
      );

    const result = await fetchAdminSecurityOperations('session-token');

    expect(result.events).toEqual([{ id: 'event-1' }]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      '/api/admin/security',
      expect.objectContaining({
        cache: 'no-store',
        headers: { Authorization: 'Bearer session-token' },
      }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      '/api/admin/security?action=events&limit=25',
      expect.objectContaining({ headers: { Authorization: 'Bearer session-token' } }),
    );
  });

  it('sends account actions with bearer authentication and CSRF protection', async () => {
    mocks.getCsrfToken.mockResolvedValue('csrf-token');
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ message: 'User suspended', account_status: 'suspended' }), {
        status: 200,
      }),
    );

    await expect(
      performAdminAccountAction('session-token', 'suspend-user', 'user-target', 'Confirmed abuse'),
    ).resolves.toEqual({ message: 'User suspended', account_status: 'suspended' });

    expect(mockFetch).toHaveBeenCalledWith('/api/admin/security?action=suspend-user', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer session-token',
        'Content-Type': 'application/json',
        'x-csrf-token': 'csrf-token',
      },
      body: JSON.stringify({ userId: 'user-target', reason: 'Confirmed abuse' }),
    });
  });

  it('surfaces the structured server error without leaking an unreadable object', async () => {
    mocks.getCsrfToken.mockResolvedValue('csrf-token');
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Cannot modify your own account' } }), {
        status: 400,
      }),
    );

    await expect(
      performAdminAccountAction('session-token', 'ban-user', 'user-self', 'test reason'),
    ).rejects.toThrow('Cannot modify your own account');
  });
});
