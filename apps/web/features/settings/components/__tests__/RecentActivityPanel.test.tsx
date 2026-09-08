import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecentActivityPanel } from '../RecentActivityPanel';

const authMocks = vi.hoisted(() => ({ getAuthToken: vi.fn() }));
vi.mock('@shared/lib/get-auth-token', () => ({
  getAuthToken: authMocks.getAuthToken,
}));

const PANEL = 'recent-activity-panel';

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RecentActivityPanel />
    </QueryClientProvider>,
  );
}

function activity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'act-1',
    sentence: 'Signed in on a new device',
    device: 'Chrome on Mac',
    createdAt: '2026-09-07T10:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.getAuthToken.mockResolvedValue('token');
});

// WEB-USE-SETTINGS-QUERIES-ACCOUNT-ACTIVITY-01: the endpoint and its query hook
// both existed and nothing rendered them, so the account's own security record
// was unreachable from the product.
describe('WEB-USE-SETTINGS-QUERIES-ACCOUNT-ACTIVITY-01', () => {
  it('collapses a run of the same event into one line with a count', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          activities: [
            activity({ id: 'a', sentence: 'Viewed projects', device: null }),
            activity({ id: 'b', sentence: 'Viewed projects', device: null }),
            activity({ id: 'c', sentence: 'Viewed projects', device: null }),
            activity({ id: 'd', sentence: 'Viewed skills', device: null }),
          ],
        }),
      })),
    );

    renderPanel();

    await waitFor(() => expect(screen.getByText(/Viewed projects/)).toBeInTheDocument());
    expect(screen.getAllByText(/Viewed projects/)).toHaveLength(1);
    expect(screen.getByTestId(PANEL).textContent).toContain('\u00d73');
    expect(screen.getByText(/Viewed skills/)).toBeInTheDocument();
  });

  it('keeps two runs apart when the same sentence came from a different device', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          activities: [
            activity({ id: 'a', sentence: 'Signed in on a new device', device: 'Chrome on Mac' }),
            activity({
              id: 'b',
              sentence: 'Signed in on a new device',
              device: 'Safari on iPhone',
            }),
          ],
        }),
      })),
    );

    renderPanel();

    await waitFor(() => expect(screen.getByText('Chrome on Mac')).toBeInTheDocument());
    expect(screen.getByText('Safari on iPhone')).toBeInTheDocument();
  });

  it('never renders an address, because the payload carries none', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ activities: [activity()] }),
      })),
    );

    renderPanel();

    await waitFor(() => expect(screen.getByText('Signed in on a new device')).toBeInTheDocument());
    expect(screen.getByTestId(PANEL).textContent).not.toMatch(/\d+\.\d+\.\d+\.\d+|::1/);
  });

  it('reads as sentences with what they were done from, and says what it is', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ activities: [activity()] }),
      })),
    );

    renderPanel();

    await waitFor(() => expect(screen.getByText('Signed in on a new device')).toBeInTheDocument());
    expect(screen.getByText('Chrome on Mac')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recent activity' })).toBeInTheDocument();
    expect(screen.getByTestId(PANEL).textContent).toContain('newest first');
  });

  it('says the account has no record rather than showing an empty box', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ activities: [] }) })),
    );

    renderPanel();

    await waitFor(() =>
      expect(screen.getByText('Nothing recorded on this account yet.')).toBeInTheDocument(),
    );
  });

  it('offers a retry when the record cannot be read', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);

    renderPanel();

    await waitFor(() =>
      expect(screen.getByText('Recent activity could not be loaded.')).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
  });

  it('asks the endpoint for a bounded page rather than the whole history', async () => {
    const requested: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      requested.push(String(url));
      return { ok: true, status: 200, json: async () => ({ activities: [] }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPanel();

    await waitFor(() => expect(requested.length).toBeGreaterThan(0));
    expect(requested[0]).toContain('limit=50');
  });
});
