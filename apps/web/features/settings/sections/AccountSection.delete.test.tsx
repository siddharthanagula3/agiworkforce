/**
 * Exercises the real useDeleteAccount hook: scheduling remains cancellable
 * until the returned deadline, and sign-out occurs only after Continue.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccountSection } from './AccountSection';

const { mockRouterReplace, mockSignOut, mockLogout, mockAddCsrfHeaders } = vi.hoisted(() => ({
  mockRouterReplace: vi.fn(),
  mockSignOut: vi.fn(),
  mockLogout: vi.fn(),
  mockAddCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => ({
    ...(headers as Record<string, string>),
    'x-csrf-token': 'csrf',
  })),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
}));

vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({ signOut: mockSignOut }),
}));

vi.mock('@/lib/identity/useSessionSnapshot', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  useSessionSnapshot: () => () => ({
    userId: 'native-user-1',
    sessionId: 'session-1',
    isCurrent: () => true,
    getToken: async () => 'captured-token',
  }),
}));

vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: 'user-1' }, logout: mockLogout }),
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

async function openAndSubmitDelete() {
  await waitFor(() => expect(screen.getByTestId('delete-account-trigger')).toBeEnabled());
  fireEvent.click(screen.getByTestId('delete-account-trigger'));
  fireEvent.change(screen.getByTestId('delete-confirm-input'), { target: { value: 'DELETE' } });
  fireEvent.click(screen.getByTestId('delete-account-confirm'));
}

describe('AccountSection · delete account (useDeleteAccount, real hook)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogout.mockResolvedValue(undefined);
    mockSignOut.mockResolvedValue(undefined);
  });

  it('signs the user out only after Continue, and surfaces the real scheduledFor date, not a hardcoded duration', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/settings/sessions' && init?.method === 'GET') {
        return jsonResponse({ sessions: [], totalCount: 0 });
      }
      if (url === '/api/user/delete-account' && init?.method === 'GET') {
        return jsonResponse({
          pending: false,
          canCancel: false,
          requestedAt: null,
          scheduledFor: null,
        });
      }
      if (url === '/api/user/delete-account' && init?.method === 'DELETE') {
        return jsonResponse({
          message:
            'Account deletion scheduled. Cancel before the deadline to keep your account. Erasure is processed afterward and may take longer.',
          scheduledFor: '2026-08-16T12:00:00.000Z',
          status: 'pending',
          statusReason: 'Deletion is scheduled and has not started.',
        });
      }
      throw new Error(`Unexpected request: ${url} ${init?.method ?? 'GET'}`);
    });

    renderAccountSection();

    await openAndSubmitDelete();

    expect(await screen.findByTestId('delete-account-success-title')).toBeInTheDocument();
    expect(mockAddCsrfHeaders).toHaveBeenCalled();
    // scheduledFor is surfaced as a real formatted date derived from the
    // server's ISO timestamp, not a hardcoded "within 24 hours" string.
    const displayedDeadline = new Date('2026-08-16T12:00:00.000Z').toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    expect(screen.getByText(/Cancellation deadline:/)).toHaveTextContent(
      `Cancellation deadline: ${displayedDeadline}`,
    );
    expect(screen.getByText(/Choose Continue to sign out/)).toBeInTheDocument();
    expect(screen.queryByText(/permanently erased on/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('delete-account-store-billing-link')).not.toBeInTheDocument();

    // Sign-out must not fire before the user acknowledges the dialog.
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('delete-account-success-continue'));

    await waitFor(() => expect(mockLogout).toHaveBeenCalledOnce());
    expect(mockLogout).toHaveBeenCalledWith({ sessionId: 'session-1' });
    expect(mockSignOut).toHaveBeenCalledWith({ sessionId: 'session-1', redirectUrl: '/' });
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/'));
  });

  it('links to the store subscription page when a store plan keeps billing', async () => {
    const manageUrl = 'https://play.google.com/store/account/subscriptions';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/settings/sessions' && init?.method === 'GET') {
        return jsonResponse({ sessions: [], totalCount: 0 });
      }
      if (url === '/api/user/delete-account' && init?.method === 'GET') {
        return jsonResponse({
          pending: false,
          canCancel: false,
          requestedAt: null,
          scheduledFor: null,
        });
      }
      if (url === '/api/user/delete-account' && init?.method === 'DELETE') {
        return jsonResponse({
          message: `Account deletion scheduled. Google Play keeps charging you until you cancel it there: ${manageUrl}`,
          scheduledFor: '2026-08-16T12:00:00.000Z',
          status: 'pending',
          statusReason: 'Deletion is scheduled and has not started.',
          storeBilling: { store: 'google', manageUrl },
        });
      }
      throw new Error(`Unexpected request: ${url} ${init?.method ?? 'GET'}`);
    });

    renderAccountSection();
    await openAndSubmitDelete();

    const link = await screen.findByTestId('delete-account-store-billing-link');
    expect(link).toHaveTextContent('Cancel your subscription in Google Play');
    expect(link).toHaveAttribute('href', manageUrl);
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('still forces navigation home if sign-out itself fails after a successful deletion', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/settings/sessions' && init?.method === 'GET') {
        return jsonResponse({ sessions: [], totalCount: 0 });
      }
      if (url === '/api/user/delete-account' && init?.method === 'GET') {
        return jsonResponse({
          pending: false,
          canCancel: false,
          requestedAt: null,
          scheduledFor: null,
        });
      }
      if (url === '/api/user/delete-account' && init?.method === 'DELETE') {
        return jsonResponse({
          message: 'Account deletion scheduled.',
          scheduledFor: '2026-08-16T12:00:00.000Z',
          status: 'pending',
          statusReason: 'Deletion is scheduled and has not started.',
        });
      }
      throw new Error(`Unexpected request: ${url} ${init?.method ?? 'GET'}`);
    });
    mockLogout.mockRejectedValue(new Error('network blip'));

    renderAccountSection();

    await openAndSubmitDelete();

    expect(await screen.findByTestId('delete-account-success-title')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('delete-account-success-continue'));

    await waitFor(() => expect(mockLogout).toHaveBeenCalledOnce());
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/'));
  });

  it('surfaces a server error on the confirm dialog without touching sign-out', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/settings/sessions' && init?.method === 'GET') {
        return jsonResponse({ sessions: [], totalCount: 0 });
      }
      if (url === '/api/user/delete-account' && init?.method === 'GET') {
        return jsonResponse({
          pending: false,
          canCancel: false,
          requestedAt: null,
          scheduledFor: null,
        });
      }
      if (url === '/api/user/delete-account' && init?.method === 'DELETE') {
        return jsonResponse(
          { error: 'Account deletion could not be scheduled. Nothing was deleted.' },
          500,
        );
      }
      throw new Error(`Unexpected request: ${url} ${init?.method ?? 'GET'}`);
    });

    renderAccountSection();

    await openAndSubmitDelete();

    expect(
      await screen.findByText('Account deletion could not be scheduled. Nothing was deleted.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('delete-account-success-title')).not.toBeInTheDocument();
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'empty body', reply: () => new Response(null, { status: 204 }) },
    { label: 'invalid JSON', reply: () => new Response('{', { status: 200 }) },
    {
      label: 'incomplete receipt',
      reply: () => jsonResponse({ message: 'Account deletion scheduled.' }),
    },
    {
      label: 'contradictory receipt',
      reply: () =>
        jsonResponse({
          message: 'Account deletion scheduled.',
          scheduledFor: '2026-08-16T12:00:00.000Z',
          status: 'pending',
          statusReason: 'Scheduled.',
          error: 'Nothing was scheduled.',
        }),
    },
  ])(
    'keeps scheduling unconfirmed after a successful HTTP response with $label',
    async ({ reply }) => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        if (url === '/api/settings/sessions' && init?.method === 'GET') {
          return jsonResponse({ sessions: [], totalCount: 0 });
        }
        if (url === '/api/user/delete-account' && init?.method === 'GET') {
          return jsonResponse({
            pending: false,
            canCancel: false,
            requestedAt: null,
            scheduledFor: null,
          });
        }
        if (url === '/api/user/delete-account' && init?.method === 'DELETE') return reply();
        throw new Error(`Unexpected request: ${url} ${init?.method ?? 'GET'}`);
      });
      renderAccountSection();
      await openAndSubmitDelete();
      expect(
        await screen.findByText(
          'We could not confirm whether deletion was scheduled. Reload the page, then check Settings > Account before trying again.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('delete-account-success-title')).not.toBeInTheDocument();
      expect(screen.queryByTestId('delete-account-success-continue')).not.toBeInTheDocument();
      expect(mockLogout).not.toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(mockRouterReplace).not.toHaveBeenCalled();
    },
  );

  it('does not expose operator details from a failed deletion', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/settings/sessions' && init?.method === 'GET') {
        return jsonResponse({ sessions: [], totalCount: 0 });
      }
      if (url === '/api/user/delete-account' && init?.method === 'GET') {
        return jsonResponse({
          pending: false,
          canCancel: false,
          requestedAt: null,
          scheduledFor: null,
        });
      }
      if (url === '/api/user/delete-account' && init?.method === 'DELETE') {
        return jsonResponse({ error: 'upstream exploded: trace 0xdeadbeef' }, 500);
      }
      throw new Error(`Unexpected request: ${url} ${init?.method ?? 'GET'}`);
    });

    renderAccountSection();
    await openAndSubmitDelete();

    expect(await screen.findByText(/went wrong on our side/i)).toBeInTheDocument();
    expect(screen.queryByText(/0xdeadbeef/i)).not.toBeInTheDocument();
  });

  it('says before confirming that what the law or a legal hold requires is kept', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/settings/sessions' && init?.method === 'GET') {
        return jsonResponse({ sessions: [], totalCount: 0 });
      }
      if (url === '/api/user/delete-account' && init?.method === 'GET') {
        return jsonResponse({
          pending: false,
          canCancel: false,
          requestedAt: null,
          scheduledFor: null,
        });
      }
      throw new Error(`Unexpected request: ${url} ${init?.method ?? 'GET'}`);
    });

    renderAccountSection();
    await waitFor(() => expect(screen.getByTestId('delete-account-trigger')).toBeEnabled());
    fireEvent.click(screen.getByTestId('delete-account-trigger'));

    expect(
      await screen.findByText(
        /Anything the law or an active legal hold requires us to keep is kept\./,
      ),
    ).toBeInTheDocument();
  });
});

type ImportedModule0 = typeof import('@/lib/identity/useSessionSnapshot');
