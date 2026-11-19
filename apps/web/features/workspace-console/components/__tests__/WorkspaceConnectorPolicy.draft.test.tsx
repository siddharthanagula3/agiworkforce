import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: async () => 'token' }));
vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  addCsrfHeaders: async (headers: Record<string, string>) => headers,
}));

import { WorkspaceConnectorPolicy } from '../WorkspaceConnectorPolicy';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function body(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-1',
    configured: true,
    canManagePolicy: true,
    currentUserRole: 'admin',
    catalog: [],
    policy: {
      allowedConnectors: [],
      blockedConnectors: [],
      allowCustomConnectors: true,
      allowedPlugins: [],
      blockedPlugins: [],
      allowedMcpHosts: [],
      allowedWebDomains: [],
      blockedWebDomains: [],
      toolRules: [],
      updatedAt: null,
      ...overrides,
    },
  };
}

function ok(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const saveButton = () => screen.getByRole('button', { name: /Save policy|Saving/ });
const customSwitch = () => screen.getByRole('switch', { name: 'Allow custom connectors' });

beforeEach(() => {
  fetchMock.mockReset();
});

describe('WorkspaceConnectorPolicy draft lifecycle', () => {
  it('keeps an edit made after a save settles while the follow-up refresh is still in flight', async () => {
    const refresh = deferred<Response>();
    let gets = 0;
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return ok(body({ allowedPlugins: ['acme-review'], updatedAt: '2026-11-09T10:00:00Z' }));
      }
      gets += 1;
      if (gets === 1) return ok(body());
      return refresh.promise;
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <WorkspaceConnectorPolicy />
      </QueryClientProvider>,
    );
    await screen.findByLabelText('Plugin key');

    fireEvent.change(screen.getByLabelText('Plugin key'), { target: { value: 'acme-review' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.click(saveButton());

    await waitFor(() => expect(saveButton()).toHaveTextContent('Save policy'));
    await waitFor(() => expect(gets).toBe(2));
    await waitFor(() => expect(customSwitch()).toBeEnabled());

    fireEvent.click(customSwitch());
    expect(customSwitch()).not.toBeChecked();

    refresh.resolve(
      ok(body({ allowedPlugins: ['acme-review'], updatedAt: '2026-11-09T10:00:01Z' })),
    );
    await new Promise((r) => setTimeout(r, 20));

    expect(customSwitch()).not.toBeChecked();
    expect(saveButton()).toBeEnabled();
  });
});

type ImportedModule0 = typeof import('@/lib/client/csrf');
