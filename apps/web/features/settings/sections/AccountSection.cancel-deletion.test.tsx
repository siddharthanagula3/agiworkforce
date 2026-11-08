/**
 * Cancelling a pending account deletion, end to end through the real
 * useAccountDeletionStatus / useCancelAccountDeletion hooks (not stubs).
 * matching how AccountSection.delete.test.tsx exercises useDeleteAccount for
 * real. Pins: the pending state renders with its deadline, the cancel
 * control is wired to PUT /api/user/delete-account/cancel-schedule behind the app's
 * confirm-dialog pattern, a successful cancel restores the normal
 * delete-account UI without a manual page refresh, and a failed cancel
 * surfaces an honest error while leaving the account still scheduled.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('@/lib/identity/useSessionSnapshot', async (importOriginal) => ({
  ...(await importOriginal<MockedModule0>()),
  useSessionSnapshot: () => () => ({
    userId: 'native-user-1',
    sessionId: 'session-1',
    isCurrent: () => true,
    getToken: async () => 'captured-token',
  }),
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
      cancellationPrecondition: 'schedule-pair-v1',
      pending: true,
      canCancel: true,
      requestedAt: new Date().toISOString(),
      scheduledFor: FUTURE_DEADLINE,
    });

    renderAccountSection();

    expect(await screen.findByTestId('pending-deletion-title')).toBeInTheDocument();
    expect(screen.queryByTestId('delete-account-trigger')).not.toBeInTheDocument();
    expect(screen.getByTestId('cancel-deletion-trigger')).toBeInTheDocument();
    expect(screen.getByText(/Cancellation deadline:/)).toBeInTheDocument();
    expect(
      screen.getByText(/Erasure is processed after the deadline and may take longer/),
    ).toBeInTheDocument();
  });

  it('shows the pending state without a cancel control once the grace window has closed', async () => {
    stubFetch({
      cancellationPrecondition: 'schedule-pair-v1',
      pending: true,
      canCancel: false,
      requestedAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
      scheduledFor: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });

    renderAccountSection();

    expect(await screen.findByTestId('pending-deletion-title')).toBeInTheDocument();
    expect(
      screen.getByText(
        /cancellation window has closed\. Erasure is processed after the deadline and may take longer\./i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('cancel-deletion-trigger')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delete-account-trigger')).not.toBeInTheDocument();
  });

  it('cancels the deletion and restores the normal delete-account UI without a manual refresh', async () => {
    stubFetch(
      {
        cancellationPrecondition: 'schedule-pair-v1',
        pending: true,
        canCancel: true,
        requestedAt: new Date().toISOString(),
        scheduledFor: FUTURE_DEADLINE,
      },
      (url, init) => {
        if (url === '/api/user/delete-account/cancel-schedule' && init?.method === 'PUT') {
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
        cancellationPrecondition: 'schedule-pair-v1',
        pending: true,
        canCancel: true,
        requestedAt: new Date().toISOString(),
        scheduledFor: FUTURE_DEADLINE,
      },
      (url, init) => {
        if (url === '/api/user/delete-account/cancel-schedule' && init?.method === 'PUT') {
          return jsonResponse(
            {
              error:
                'The cancellation window has closed. This does not confirm that erasure is complete.',
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
      await screen.findByText(
        /cancellation window has closed\. This does not confirm that erasure is complete/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('pending-deletion-title')).toBeInTheDocument();
    expect(screen.queryByTestId('delete-account-trigger')).not.toBeInTheDocument();
  });

  it.each([
    { label: 'empty body', reply: () => new Response(null, { status: 204 }) },
    { label: 'invalid JSON', reply: () => new Response('{', { status: 200 }) },
    { label: 'missing receipt', reply: () => jsonResponse({}) },
    {
      label: 'contradictory refusal',
      reply: () =>
        jsonResponse({
          message: 'No account deletion is pending.',
          cancelled: false,
          reason: 'grace_window_expired',
        }),
    },
  ])('leaves the schedule and confirmation dialog intact after $label', async ({ reply }) => {
    stubFetch(
      {
        cancellationPrecondition: 'schedule-pair-v1',
        pending: true,
        canCancel: true,
        requestedAt: new Date().toISOString(),
        scheduledFor: FUTURE_DEADLINE,
      },
      (url, init) =>
        url === '/api/user/delete-account/cancel-schedule' && init?.method === 'PUT'
          ? reply()
          : null,
    );
    renderAccountSection();
    fireEvent.click(await screen.findByTestId('cancel-deletion-trigger'));
    fireEvent.click(await screen.findByTestId('cancel-deletion-confirm'));
    expect(
      await screen.findByText(
        'We could not confirm the cancellation outcome. Check the current status, then open a new confirmation before trying again.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('pending-deletion-title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check current status' })).toBeInTheDocument();
    expect(screen.queryByTestId('delete-account-trigger')).not.toBeInTheDocument();
  });

  it('accepts the server confirmation that no deletion is pending without claiming it cancelled one', async () => {
    stubFetch(
      {
        cancellationPrecondition: 'schedule-pair-v1',
        pending: true,
        canCancel: true,
        requestedAt: new Date().toISOString(),
        scheduledFor: FUTURE_DEADLINE,
      },
      (url, init) =>
        url === '/api/user/delete-account/cancel-schedule' && init?.method === 'PUT'
          ? jsonResponse({ message: 'No account deletion is pending.', cancelled: false })
          : null,
    );
    renderAccountSection();
    fireEvent.click(await screen.findByTestId('cancel-deletion-trigger'));
    fireEvent.click(await screen.findByTestId('cancel-deletion-confirm'));
    expect(await screen.findByTestId('delete-account-trigger')).toBeInTheDocument();
    expect(screen.queryByTestId('pending-deletion-title')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cancel-deletion-confirm')).not.toBeInTheDocument();
    expect(screen.queryByText('Account deletion cancelled.')).not.toBeInTheDocument();
  });

  it('does not expose operator details from a failed cancellation', async () => {
    stubFetch(
      {
        cancellationPrecondition: 'schedule-pair-v1',
        pending: true,
        canCancel: true,
        requestedAt: new Date().toISOString(),
        scheduledFor: FUTURE_DEADLINE,
      },
      (url, init) =>
        url === '/api/user/delete-account/cancel-schedule' && init?.method === 'PUT'
          ? jsonResponse({ error: 'HTTP 500: SELECT secret FROM profiles' }, 500)
          : null,
    );

    renderAccountSection();

    fireEvent.click(await screen.findByTestId('cancel-deletion-trigger'));
    fireEvent.click(await screen.findByTestId('cancel-deletion-confirm'));

    expect(
      await screen.findByText(/could not confirm the cancellation outcome/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/SELECT secret/i)).not.toBeInTheDocument();
  });

  it('keeps the deadline visible without inventing expiry when protected cancellation is unavailable (UNRUN)', async () => {
    stubFetch({ pending: true, canCancel: true, requestedAt: null, scheduledFor: FUTURE_DEADLINE });
    renderAccountSection();
    expect(await screen.findByTestId('pending-deletion-title')).toBeInTheDocument();
    expect(screen.getByText(/Protected cancellation is unavailable/)).toBeInTheDocument();
    expect(screen.getByTestId('cancel-deletion-trigger')).toBeDisabled();
    expect(screen.queryByText(/cancellation window has closed/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check current status' }));
    await waitFor(() =>
      expect(
        vi
          .mocked(globalThis.fetch)
          .mock.calls.filter(
            ([input, init]) =>
              String(input) === '/api/user/delete-account' && init?.method === 'GET',
          ),
      ).toHaveLength(2),
    );
    expect(
      vi
        .mocked(globalThis.fetch)
        .mock.calls.some(([, init]) => init?.method === 'PUT' || init?.method === 'POST'),
    ).toBe(false);
  });

  it('shows the normal delete-account trigger when nothing is pending', async () => {
    stubFetch({ pending: false, canCancel: false, requestedAt: null, scheduledFor: null });

    renderAccountSection();

    expect(await screen.findByTestId('delete-account-trigger')).toBeInTheDocument();
    expect(screen.queryByTestId('pending-deletion-title')).not.toBeInTheDocument();
  });

  it('blocks a new deletion request when the status response is malformed', async () => {
    stubFetch({ pending: false, canCancel: false, requestedAt: null, scheduledFor: '2026-09-28' });

    renderAccountSection();

    await waitFor(() =>
      expect(
        screen
          .getAllByRole('alert')
          .some((alert) =>
            alert.textContent?.includes('Could not check whether a deletion is already pending.'),
          ),
      ).toBe(true),
    );
    expect(screen.getByTestId('delete-account-trigger')).toBeDisabled();
  });
});

type MockedModule0 = typeof import('@/lib/identity/useSessionSnapshot');
