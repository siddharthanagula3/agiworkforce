/**
 * Cancelling a pending account deletion, end to end through the real
 * useAccountDeletionStatus / useCancelAccountDeletion hooks (not stubs).
 * matching how AccountSection.delete.test.tsx exercises useDeleteAccount for
 * real. Pins: the pending state renders with its deadline, the cancel
 * control is wired to POST /api/user/delete-account/cancel behind the app's
 * confirm-dialog pattern, a successful cancel restores the normal
 * delete-account UI without a manual page refresh, and a failed cancel
 * surfaces an honest error while leaving the account still scheduled.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccountSection } from './AccountSection';

const { mockAddCsrfHeaders } = vi.hoisted(() => ({
  mockAddCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => ({
    ...(headers as Record<string, string>),
    'x-csrf-token': 'csrf',
  })),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: 'user-1' }, logout: vi.fn() }),
}));

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: mockAddCsrfHeaders,
}));

vi.mock('../components/Settings/ApiKeys', () => ({
  ApiKeysManager: () => <div>Scoped API key manager</div>,
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderAccountSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AccountSection />
    </QueryClientProvider>,
  );
}

const FUTURE_DEADLINE = new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString();

function stubFetch(
  deletionStatus: unknown,
  extra?: (url: string, init?: RequestInit) => Response | null,
) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === '/api/settings/sessions' && init?.method === 'GET') {
      return jsonResponse({ sessions: [], totalCount: 0 });
    }
    if (url === '/api/user/delete-account' && init?.method === 'GET') {
      return jsonResponse(deletionStatus);
    }
    const overridden = extra?.(url, init);
    if (overridden) return overridden;
    throw new Error(`Unexpected request: ${url} ${init?.method ?? 'GET'}`);
  });
}

describe('AccountSection · cancel pending deletion (real hooks)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the pending state with its deadline instead of the delete trigger', async () => {
    stubFetch({
      pending: true,
      canCancel: true,
      requestedAt: new Date().toISOString(),
      scheduledFor: FUTURE_DEADLINE,
    });

    renderAccountSection();

    expect(await screen.findByTestId('pending-deletion-title')).toBeInTheDocument();
    expect(screen.queryByTestId('delete-account-trigger')).not.toBeInTheDocument();
    expect(screen.getByTestId('cancel-deletion-trigger')).toBeInTheDocument();
  });

  it('shows the pending state without a cancel control once the grace window has closed', async () => {
    stubFetch({
      pending: true,
      canCancel: false,
      requestedAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
      scheduledFor: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });

    renderAccountSection();

    expect(await screen.findByTestId('pending-deletion-title')).toBeInTheDocument();
    expect(screen.getByText(/cancellation window has closed/i)).toBeInTheDocument();
    expect(screen.queryByTestId('cancel-deletion-trigger')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delete-account-trigger')).not.toBeInTheDocument();
  });

  it('cancels the deletion and restores the normal delete-account UI without a manual refresh', async () => {
    stubFetch(
      {
        pending: true,
        canCancel: true,
        requestedAt: new Date().toISOString(),
        scheduledFor: FUTURE_DEADLINE,
      },
      (url, init) => {
        if (url === '/api/user/delete-account/cancel' && init?.method === 'POST') {
          return jsonResponse({
            message: 'Account deletion cancelled. Your account is fully restored.',
            cancelled: true,
          });
        }
        return null;
      },
    );

    renderAccountSection();

    fireEvent.click(await screen.findByTestId('cancel-deletion-trigger'));
    fireEvent.click(await screen.findByTestId('cancel-deletion-confirm'));

    expect(await screen.findByTestId('delete-account-trigger')).toBeInTheDocument();
    expect(mockAddCsrfHeaders).toHaveBeenCalled();
    expect(screen.queryByTestId('pending-deletion-title')).not.toBeInTheDocument();
  });

  it('surfaces a server error on the cancel dialog and leaves the account still scheduled', async () => {
    stubFetch(
      {
        pending: true,
        canCancel: true,
        requestedAt: new Date().toISOString(),
        scheduledFor: FUTURE_DEADLINE,
      },
      (url, init) => {
        if (url === '/api/user/delete-account/cancel' && init?.method === 'POST') {
          return jsonResponse(
            {
              error: 'The cancellation window has closed and erasure is already underway.',
              cancelled: false,
              reason: 'grace_window_expired',
            },
            409,
          );
        }
        return null;
      },
    );

    renderAccountSection();

    fireEvent.click(await screen.findByTestId('cancel-deletion-trigger'));
    fireEvent.click(await screen.findByTestId('cancel-deletion-confirm'));

    expect(
      await screen.findByText(/cancellation window has closed and erasure is already underway/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId('pending-deletion-title')).toBeInTheDocument();
    expect(screen.queryByTestId('delete-account-trigger')).not.toBeInTheDocument();
  });

  it('shows the normal delete-account trigger when nothing is pending', async () => {
    stubFetch({ pending: false, canCancel: false, requestedAt: null, scheduledFor: null });

    renderAccountSection();

    expect(await screen.findByTestId('delete-account-trigger')).toBeInTheDocument();
    expect(screen.queryByTestId('pending-deletion-title')).not.toBeInTheDocument();
  });
});
