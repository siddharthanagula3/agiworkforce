import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: async () => 'token' }));
vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  addCsrfHeaders: async (headers: Record<string, string>) => headers,
}));

import { WorkspaceModelPolicy } from '../WorkspaceModelPolicy';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

interface Lists {
  allowedProviders: string[];
  blockedProviders: string[];
  allowedModels: string[];
  blockedModels: string[];
}

const EMPTY: Lists = {
  allowedProviders: [],
  blockedProviders: [],
  allowedModels: [],
  blockedModels: [],
};

function body(lists: Lists, updatedAt: string | null = null) {
  return {
    organizationId: 'org-1',
    configured: true,
    canManagePolicy: true,
    currentUserRole: 'admin',
    policy: { ...lists, updatedAt },
    catalog: {
      providers: ['alpha', 'beta'],
      models: [{ id: 'alpha-one', name: 'Alpha One', provider: 'alpha', live: true }],
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

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceModelPolicy />
    </QueryClientProvider>,
  );
}

function providerRow(name: string) {
  const section = within(screen.getByRole('region', { name: 'Providers' }));
  return within(section.getByText(name).closest('li') as HTMLElement);
}

const saveButton = () => screen.getByRole('button', { name: /Save model policy|Saving/ });

beforeEach(() => {
  fetchMock.mockReset();
});

describe('WorkspaceModelPolicy draft lifecycle', () => {
  it('keeps an edit made after a save settles while the follow-up refresh is still in flight', async () => {
    const savedPolicy: Lists = { ...EMPTY, blockedProviders: ['alpha'] };
    const refresh = deferred<Response>();
    let gets = 0;
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return ok(body(savedPolicy, '2026-11-09T10:00:00Z'));
      gets += 1;
      if (gets === 1) return ok(body(EMPTY));
      return refresh.promise;
    });

    renderPanel();
    await screen.findByText('Providers');

    fireEvent.click(providerRow('alpha').getByRole('button', { name: /Block/ }));
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, i]) => i?.method === 'PUT')).toBe(true),
    );
    await waitFor(() => expect(saveButton()).toHaveTextContent('Save model policy'));
    await waitFor(() => expect(gets).toBe(2));

    fireEvent.click(providerRow('beta').getByRole('button', { name: /Block/ }));
    expect(providerRow('beta').getByRole('button', { name: /Block/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    refresh.resolve(ok(body(savedPolicy, '2026-11-09T10:00:01Z')));

    await new Promise((r) => setTimeout(r, 20));

    expect(providerRow('beta').getByRole('button', { name: /Block/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(providerRow('alpha').getByRole('button', { name: /Block/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(saveButton()).toBeEnabled();
  });

  it('shows the saved policy as the clean base as soon as the save succeeds', async () => {
    const savedPolicy: Lists = { ...EMPTY, blockedProviders: ['alpha'] };
    const refresh = deferred<Response>();
    let gets = 0;
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return ok(body(savedPolicy));
      gets += 1;
      if (gets === 1) return ok(body(EMPTY));
      return refresh.promise;
    });

    renderPanel();
    await screen.findByText('Providers');
    fireEvent.click(providerRow('alpha').getByRole('button', { name: /Block/ }));
    expect(saveButton()).toBeEnabled();
    fireEvent.click(saveButton());

    await waitFor(() => expect(saveButton()).toBeDisabled());
    await waitFor(() => expect(gets).toBe(2));
    expect(saveButton()).toHaveTextContent('Save model policy');
    expect(providerRow('alpha').getByRole('button', { name: /Block/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    refresh.resolve(ok(body(savedPolicy)));
  });

  it('adopts a server change when the administrator has no unsaved edit', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    fetchMock.mockResolvedValue(ok(body(EMPTY)));
    render(
      <QueryClientProvider client={client}>
        <WorkspaceModelPolicy />
      </QueryClientProvider>,
    );
    await screen.findByText('Providers');

    client.setQueryData(
      ['workspace', 'model-policy'],
      body({ ...EMPTY, blockedProviders: ['beta'] }),
    );

    await waitFor(() =>
      expect(providerRow('beta').getByRole('button', { name: /Block/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
  });

  it('keeps an unsaved edit when the server data changes underneath it', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    fetchMock.mockResolvedValue(ok(body(EMPTY)));
    render(
      <QueryClientProvider client={client}>
        <WorkspaceModelPolicy />
      </QueryClientProvider>,
    );
    await screen.findByText('Providers');

    fireEvent.click(providerRow('alpha').getByRole('button', { name: /Block/ }));
    client.setQueryData(
      ['workspace', 'model-policy'],
      body({ ...EMPTY, blockedProviders: ['beta'] }),
    );

    await waitFor(() => expect(saveButton()).toBeEnabled());
    expect(providerRow('alpha').getByRole('button', { name: /Block/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('keeps the draft and reports the failure when the save is rejected', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return { ok: false, status: 400, json: async () => ({ error: 'Rejected.' }) } as Response;
      }
      return ok(body(EMPTY));
    });

    renderPanel();
    await screen.findByText('Providers');
    fireEvent.click(providerRow('alpha').getByRole('button', { name: /Block/ }));
    fireEvent.click(saveButton());

    await screen.findByText(/Rejected\.|Could not update model policy/);
    expect(providerRow('alpha').getByRole('button', { name: /Block/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(saveButton()).toBeEnabled();
  });
});

type ImportedModule0 = typeof import('@/lib/client/csrf');
