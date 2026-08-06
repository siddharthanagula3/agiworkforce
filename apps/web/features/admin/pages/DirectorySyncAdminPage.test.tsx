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
    // Listed as a connection and offered as a token target.
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
    // Nothing is invented when the server refuses.
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

    // The re-listing after minting must not contain the raw value; the UI shows
    // only the public prefix for the persisted token.
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
