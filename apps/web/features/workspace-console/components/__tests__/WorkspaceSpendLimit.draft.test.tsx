import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn(async () => 'token') }));
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => headers),
}));

import { WorkspaceSpendLimit } from '../WorkspaceSpendLimit';

const fetchMock = vi.fn();

function spendLimit(monthlyCapCredits: number, spentCredits: number) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      canManageLimit: true,
      state: {
        configured: true,
        monthlyCapCredits,
        enforcement: 'notify',
        alertThresholdPct: 80,
        spentCredits,
        usedPct: 1,
        overCap: false,
        overThreshold: false,
      },
    }),
  } as Response;
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <WorkspaceSpendLimit />
    </QueryClientProvider>,
  );
  return client;
}

async function refresh(client: QueryClient) {
  await act(async () => {
    await client.invalidateQueries();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

describe('WorkspaceSpendLimit draft lifecycle', () => {
  it('keeps an unsaved cap when a refresh brings new usage figures', async () => {
    fetchMock.mockResolvedValue(spendLimit(100, 1));
    const client = renderPanel();
    const cap = await screen.findByLabelText('Cap (credits)');
    expect(cap).toHaveValue(100);

    fireEvent.change(cap, { target: { value: '250' } });
    fetchMock.mockResolvedValue(spendLimit(100, 5));
    await refresh(client);

    expect(screen.getByLabelText('Cap (credits)')).toHaveValue(250);
  });

  it('adopts a cap changed elsewhere when nothing is unsaved', async () => {
    fetchMock.mockResolvedValue(spendLimit(100, 1));
    const client = renderPanel();
    expect(await screen.findByLabelText('Cap (credits)')).toHaveValue(100);

    fetchMock.mockResolvedValue(spendLimit(300, 1));
    await refresh(client);

    expect(screen.getByLabelText('Cap (credits)')).toHaveValue(300);
  });
});
