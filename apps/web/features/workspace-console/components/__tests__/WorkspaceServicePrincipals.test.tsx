import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn(async () => 'token') }));
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => headers),
}));

import { WorkspaceServicePrincipals } from '../WorkspaceServicePrincipals';

const PRINCIPAL = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'SIEM',
  description: null,
  maxScopes: ['audit.read'],
  createdAt: '2026-09-17T00:00:00.000Z',
  disabledAt: null,
};

function body(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-1',
    canManage: true,
    reachableRoutes: ['/api/settings/organization/audit'],
    principals: [PRINCIPAL],
    ...overrides,
  };
}

function respond(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as unknown as Response;
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceServicePrincipals />
    </QueryClientProvider>,
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

describe('WorkspaceServicePrincipals', () => {
  it('names the endpoints a principal can reach', async () => {
    fetchMock.mockResolvedValue(respond(body()));
    renderPanel();

    expect(await screen.findByText('SIEM')).toBeInTheDocument();
    expect(
      screen.getByText(/\/api\/settings\/organization\/audit/u, { exact: false }),
    ).toBeInTheDocument();
  });

  it('names the consequence before disabling a principal', async () => {
    fetchMock.mockResolvedValue(respond(body()));
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: 'Disable' }));
    expect(
      await screen.findByText(/Every key issued to this principal stops working/u),
    ).toBeVisible();

    fetchMock.mockResolvedValueOnce(
      respond({ principal: { ...PRINCIPAL, disabledAt: '2026-09-18T00:00:00.000Z' } }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Disable principal' }));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
      expect(patch?.[0]).toBe('/api/settings/organization/service-principals');
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({
        principalId: PRINCIPAL.id,
        disabled: true,
      });
    });
  });

  it('enables a disabled principal without a confirmation', async () => {
    fetchMock.mockResolvedValue(
      respond(body({ principals: [{ ...PRINCIPAL, disabledAt: '2026-09-18T00:00:00.000Z' }] })),
    );
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: 'Enable' }));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
      expect(JSON.parse(String(patch?.[1]?.body)).disabled).toBe(false);
    });
  });

  it('offers no control to a member who cannot manage identity', async () => {
    fetchMock.mockResolvedValue(respond(body({ canManage: false })));
    renderPanel();

    expect(await screen.findByText('SIEM')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disable' })).toBeNull();
  });
});
