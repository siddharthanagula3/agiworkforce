import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn(async () => 'token') }));
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => headers),
}));

import { delegationState, WorkspaceDelegation } from '../WorkspaceDelegation';

const DELEGATION = {
  id: '44444444-4444-4444-8444-444444444444',
  organizationId: 'org-1',
  delegateUserId: 'finance-user',
  grantedByUserId: 'owner-user',
  scopes: ['admin.billing.view'],
  reason: null,
  expiresAt: '2099-01-01T00:00:00.000Z',
  revokedAt: null,
  createdAt: '2026-09-18T00:00:00.000Z',
};

const MEMBERS = [
  {
    userId: 'finance-user',
    name: 'Finance',
    email: 'f@example.com',
    role: 'member',
    isCurrentUser: false,
  },
  {
    userId: 'owner-user',
    name: 'Owner',
    email: 'o@example.com',
    role: 'owner',
    isCurrentUser: true,
  },
];

function body(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-1',
    canManage: true,
    delegatablePermissions: ['admin.billing.view', 'admin.identity.manage'],
    maxDurationMs: 90 * 24 * 60 * 60_000,
    yourScopes: [],
    delegations: [DELEGATION],
    ...overrides,
  };
}

function respond(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as unknown as Response;
}

function route(payload: unknown) {
  return (input: string, init?: RequestInit) => {
    if (input === '/api/settings/team') return Promise.resolve(respond({ members: MEMBERS }));
    if (init?.method === 'POST' || init?.method === 'DELETE') {
      return Promise.resolve(respond({ delegation: DELEGATION }));
    }
    return Promise.resolve(respond(payload));
  };
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceDelegation />
    </QueryClientProvider>,
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

describe('delegationState', () => {
  it('separates live, expired and revoked', () => {
    const now = Date.parse('2026-09-18T12:00:00.000Z');
    expect(delegationState(DELEGATION, now)).toBe('live');
    expect(delegationState({ ...DELEGATION, expiresAt: '2026-09-01T00:00:00.000Z' }, now)).toBe(
      'expired',
    );
    expect(delegationState({ ...DELEGATION, revokedAt: '2026-09-17T00:00:00.000Z' }, now)).toBe(
      'revoked',
    );
  });
});

describe('WorkspaceDelegation', () => {
  it('says what a delegation can never do', async () => {
    fetchMock.mockImplementation(route(body()));
    renderPanel();

    expect(
      await screen.findByText(/never lets its holder remove, demote or transfer an owner/u),
    ).toBeInTheDocument();
    expect(screen.getByText(/at most 90 days/u)).toBeInTheDocument();
  });

  it('grants a delegation with the scopes and expiry that were chosen', async () => {
    fetchMock.mockImplementation(route(body()));
    renderPanel();

    await userEvent.selectOptions(
      await screen.findByLabelText(/Member/u),
      await screen.findByRole('option', { name: /Finance/u }),
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'admin.billing.view' }));
    await userEvent.selectOptions(screen.getByLabelText(/Expires in/u), '7');
    await userEvent.click(screen.getByRole('button', { name: 'Grant delegation' }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
      const payload = JSON.parse(String(post?.[1]?.body));
      expect(payload.delegateUserId).toBe('finance-user');
      expect(payload.scopes).toEqual(['admin.billing.view']);
      expect(Date.parse(payload.expiresAt)).toBeGreaterThan(Date.now());
    });
  });

  it('refuses to submit without a member and a permission', async () => {
    fetchMock.mockImplementation(route(body()));
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: 'Grant delegation' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose a member and at least one permission.',
    );
    expect(fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')).toBeUndefined();
  });

  it('turns a rejected grant request into actionable network copy', async () => {
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.reject(new TypeError('Failed to fetch'));
      return route(body())(input, init);
    });
    renderPanel();

    await userEvent.selectOptions(
      await screen.findByLabelText(/Member/u),
      await screen.findByRole('option', { name: /Finance/u }),
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'admin.billing.view' }));
    await userEvent.click(screen.getByRole('button', { name: 'Grant delegation' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.');
    expect(screen.queryByText('Failed to fetch')).not.toBeInTheDocument();
  });

  it('names the consequence before revoking', async () => {
    fetchMock.mockImplementation(route(body()));
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
    expect(await screen.findByText(/Revoking cannot be undone/u)).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Revoke delegation' }));
    await waitFor(() => {
      const request = fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE');
      expect(JSON.parse(String(request?.[1]?.body))).toEqual({ delegationId: DELEGATION.id });
    });
  });

  it('offers no controls to a member who cannot manage roles', async () => {
    fetchMock.mockImplementation(route(body({ canManage: false })));
    renderPanel();

    expect(await screen.findByText('finance-user')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Grant delegation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull();
  });

  it('shows an expired delegation without a revoke control', async () => {
    fetchMock.mockImplementation(
      route(body({ delegations: [{ ...DELEGATION, expiresAt: '2026-01-01T00:00:00.000Z' }] })),
    );
    renderPanel();

    expect(await screen.findByText(/Expired/u)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull();
  });
});
