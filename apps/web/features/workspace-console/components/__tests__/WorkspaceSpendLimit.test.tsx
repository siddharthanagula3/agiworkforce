import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn(async () => 'token') }));
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => headers),
}));

import { WorkspaceSpendLimit } from '../WorkspaceSpendLimit';

const fetchMock = vi.fn();

function response(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function spendLimit() {
  return {
    canManageLimit: true,
    state: {
      configured: false,
      monthlyCapCents: null,
      enforcement: 'notify',
      alertThresholdPct: 80,
      spentCents: 0,
      usedPct: null,
      overCap: false,
      overThreshold: false,
    },
  };
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceSpendLimit />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

describe('WorkspaceSpendLimit', () => {
  it('shows a retryable load error without a raw HTTP status', async () => {
    fetchMock.mockResolvedValue(response({}, 500));
    renderPanel();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The spend limit could not be loaded');
    expect(alert).not.toHaveTextContent(/HTTP|500/i);

    fetchMock.mockResolvedValue(response(spendLimit()));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Monthly spend limit' })).toBeVisible();
  });

  it('shows a save failure without exposing transport details', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === 'PUT' ? response({}, 429) : response(spendLimit()),
    );
    renderPanel();

    fireEvent.change(await screen.findByLabelText('Cap (USD)'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set limit' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The spend limit could not be saved');
    expect(alert).not.toHaveTextContent(/HTTP|429/i);
  });

  it('renders nothing for a caller who cannot administer the limit', async () => {
    fetchMock.mockResolvedValue(response({}, 403));
    const view = renderPanel();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await waitFor(() => expect(view.container).toBeEmptyDOMElement());
  });
});
