import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn(async () => 'csrf-token'),
}));

import DirectorySyncAdminPage from './DirectorySyncAdminPage';

const CONNECTION_ID = '33333333-3333-4333-8333-333333333333';

function connectionsPayload(overrides: Record<string, unknown> = {}) {
  return {
    connections: [
      {
        id: CONNECTION_ID,
        organization_id: '11111111-1111-4111-8111-111111111111',
        provider: 'okta',
        directory_id: 'dir-1',
        display_name: 'Okta production',
        is_active: true,
        last_sync_at: '2026-08-01T10:00:00.000Z',
        created_at: '2026-07-01T10:00:00.000Z',
      },
    ],
    events: [
      {
        id: 'event-1',
        connection_id: CONNECTION_ID,
        event_type: 'user.provisioned',
        user_email: 'ada@example.com',
        error: null,
        created_at: '2026-08-01T10:00:00.000Z',
      },
    ],
    organization_id: '11111111-1111-4111-8111-111111111111',
    scim_base_url: 'https://app.example.com/api/scim/v2',
    ...overrides,
  };
}

const GROUP_ID = '44444444-4444-4444-8444-444444444444';

function groupsPayload(overrides: Record<string, unknown> = {}) {
  return {
    groups: [
      {
        id: GROUP_ID,
        connection_id: CONNECTION_ID,
        external_id: 'okta-group-1',
        display_name: 'Platform engineers',
        mapped_role: null,
        member_count: 3,
        updated_at: '2026-08-01T10:00:00.000Z',
      },
    ],
    organization_id: '11111111-1111-4111-8111-111111111111',
    mappable_roles: ['admin', 'member', 'viewer'],
    can_manage_roles: true,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

describe('DirectorySyncAdminPage', () => {
  it('shows the SCIM base URL, connections, and recent IdP activity', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/tokens')) return jsonResponse({ tokens: [] });
      return jsonResponse(connectionsPayload());
    });

    render(<DirectorySyncAdminPage />);

    expect(await screen.findByText('https://app.example.com/api/scim/v2')).toBeTruthy();
    expect(screen.getAllByText(/Okta production/).length).toBeGreaterThan(0);
    expect(screen.getByText(/user\.provisioned/)).toBeTruthy();
  });

  it('surfaces the entitlement refusal instead of rendering an empty page', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({ error: 'Directory sync requires an active Enterprise subscription' }, 403),
    );

    render(<DirectorySyncAdminPage />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Enterprise subscription');
    expect(screen.queryByText(/Okta production/)).toBeNull();
  });

  it('mints a token, shows the raw value once, and never re-fetches it', async () => {
    const rawToken = `scim_${'ab'.repeat(8)}_${'cd'.repeat(24)}`;

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/tokens') && init?.method === 'POST') {
        return jsonResponse({
          token: {
            id: 'token-1',
            connection_id: CONNECTION_ID,
            name: 'Okta production',
            token_prefix: 'ab'.repeat(8),
            expires_at: null,
            created_at: '2026-08-05T00:00:00.000Z',
          },
          raw_token: rawToken,
          scim_base_url: 'https://app.example.com/api/scim/v2',
        });
      }
      if (url.includes('/tokens')) {
        return jsonResponse({
          tokens: [
            {
              id: 'token-1',
              connection_id: CONNECTION_ID,
              name: 'Okta production',
              token_prefix: 'ab'.repeat(8),
              last_used_at: null,
              expires_at: null,
              revoked_at: null,
              created_at: '2026-08-05T00:00:00.000Z',
            },
          ],
        });
      }
      return jsonResponse(connectionsPayload());
    });

    render(<DirectorySyncAdminPage />);
    await screen.findByText('https://app.example.com/api/scim/v2');

    fireEvent.change(screen.getByLabelText(/Connection/), { target: { value: CONNECTION_ID } });
    fireEvent.change(screen.getByLabelText(/Token name/), {
      target: { value: 'Okta production' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Mint token/i }));

    expect(await screen.findByText(rawToken)).toBeTruthy();
    expect(screen.getByText(/will not be shown again/i)).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText(new RegExp(`scim_${'ab'.repeat(8)}_…`))).toBeTruthy();
    });

    const mintCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).includes('/tokens') && init?.method === 'POST',
    );
    expect(mintCall?.[1]?.headers).toMatchObject({ 'x-csrf-token': 'csrf-token' });
  });

  it('sends a CSRF token when revoking', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/tokens') && init?.method === 'DELETE') {
        return jsonResponse({ success: true, id: 'token-1' });
      }
      if (url.includes('/tokens')) {
        return jsonResponse({
          tokens: [
            {
              id: 'token-1',
              connection_id: CONNECTION_ID,
              name: 'Okta production',
              token_prefix: 'ab'.repeat(8),
              last_used_at: null,
              expires_at: null,
              revoked_at: null,
              created_at: '2026-08-05T00:00:00.000Z',
            },
          ],
        });
      }
      return jsonResponse(connectionsPayload());
    });

    render(<DirectorySyncAdminPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Revoke/i }));

    await waitFor(() => {
      const revokeCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url).includes('/tokens/token-1') && init?.method === 'DELETE',
      );
      expect(revokeCall?.[1]?.headers).toMatchObject({ 'x-csrf-token': 'csrf-token' });
    });
  });

  it('lets an owner map a synced group to a role and sends the PATCH', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/groups') && init?.method === 'PATCH') {
        return jsonResponse({
          group: { ...groupsPayload().groups[0], mapped_role: 'admin' },
          members_reconciled: 3,
        });
      }
      if (String(url).includes('/groups')) return jsonResponse(groupsPayload());
      if (String(url).includes('/tokens')) return jsonResponse({ tokens: [] });
      return jsonResponse(connectionsPayload());
    });

    render(<DirectorySyncAdminPage />);

    const select = (await screen.findByLabelText(
      /Role for Platform engineers/i,
    )) as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(select.disabled).toBe(false);

    fireEvent.change(select, { target: { value: 'admin' } });

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([callUrl, callInit]) =>
          String(callUrl).includes('/api/admin/directory-sync/groups') &&
          callInit?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
      expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
        groupId: GROUP_ID,
        mappedRole: 'admin',
      });
      expect(patchCall?.[1]?.headers).toMatchObject({ 'x-csrf-token': 'csrf-token' });
    });

    await waitFor(() => {
      expect(
        (screen.getByLabelText(/Role for Platform engineers/i) as HTMLSelectElement).value,
      ).toBe('admin');
    });
  });

  it('clears a mapping by sending an explicit null rather than an empty string', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/groups') && init?.method === 'PATCH') {
        return jsonResponse({
          group: { ...groupsPayload().groups[0], mapped_role: null },
          members_reconciled: 3,
        });
      }
      if (String(url).includes('/groups')) {
        return jsonResponse(
          groupsPayload({
            groups: [{ ...groupsPayload().groups[0], mapped_role: 'admin' }],
          }),
        );
      }
      if (String(url).includes('/tokens')) return jsonResponse({ tokens: [] });
      return jsonResponse(connectionsPayload());
    });

    render(<DirectorySyncAdminPage />);

    const select = await screen.findByLabelText(/Role for Platform engineers/i);
    fireEvent.change(select, { target: { value: '' } });

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([callUrl, callInit]) =>
          String(callUrl).includes('/api/admin/directory-sync/groups') &&
          callInit?.method === 'PATCH',
      );
      expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
        groupId: GROUP_ID,
        mappedRole: null,
      });
    });
  });

  it('shows a non-owner the mapping read-only instead of a control that would 403', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/groups')) {
        return jsonResponse(groupsPayload({ can_manage_roles: false }));
      }
      if (String(url).includes('/tokens')) return jsonResponse({ tokens: [] });
      return jsonResponse(connectionsPayload());
    });

    render(<DirectorySyncAdminPage />);

    const select = (await screen.findByLabelText(
      /Role for Platform engineers/i,
    )) as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(
      screen.getByText(/Only an organization owner can change group role mapping/i),
    ).toBeTruthy();
  });

  it('surfaces a refused mapping change instead of showing the new role', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/groups') && init?.method === 'PATCH') {
        return jsonResponse(
          { error: 'Only an organization owner can change group role mapping' },
          403,
        );
      }
      if (String(url).includes('/groups')) return jsonResponse(groupsPayload());
      if (String(url).includes('/tokens')) return jsonResponse({ tokens: [] });
      return jsonResponse(connectionsPayload());
    });

    render(<DirectorySyncAdminPage />);

    fireEvent.change(await screen.findByLabelText(/Role for Platform engineers/i), {
      target: { value: 'admin' },
    });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('organization owner');
    expect((screen.getByLabelText(/Role for Platform engineers/i) as HTMLSelectElement).value).toBe(
      '',
    );
  });

  it('reports a failed connection create rather than pretending it worked', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/tokens')) return jsonResponse({ tokens: [] });
      if (init?.method === 'POST') {
        return jsonResponse({ error: 'A connection with this directory_id already exists' }, 409);
      }
      return jsonResponse(connectionsPayload());
    });

    render(<DirectorySyncAdminPage />);
    await screen.findByText('https://app.example.com/api/scim/v2');

    fireEvent.change(screen.getByLabelText(/Directory ID/), { target: { value: 'dir-1' } });
    fireEvent.click(screen.getByRole('button', { name: /Add connection/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('already exists');
  });
});
