/**
 * Account deletion is now a single implementation: useDeleteAccount
 * (features/settings/hooks/use-settings-queries.ts), consumed only by
 * AccountSection. This suite exercises the REAL hook (unlike
 * AccountSection.sessions.test.tsx / AccountSection.api-keys.test.tsx, which
 * stub useDeleteAccount because they test unrelated behavior) to pin the
 * invariant that used to only hold on this surface and not on the
 * now-removed PrivacySection copy: a successful deletion always signs the
 * user out, so a deleted account can never keep a live client session.
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
  fireEvent.click(await screen.findByTestId('delete-account-trigger'));
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
            'Account deletion scheduled. Your account and all data will be permanently deleted within 24 hours.',
          scheduledFor: '2026-08-16T12:00:00.000Z',
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
    expect(screen.getByText(/Your data is permanently erased on/)).toBeInTheDocument();

    // Sign-out must not fire before the user acknowledges the dialog.
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('delete-account-success-continue'));

    await waitFor(() => expect(mockLogout).toHaveBeenCalledOnce());
    expect(mockSignOut).toHaveBeenCalledWith({ redirectUrl: '/' });
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/'));
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
          message: 'Account deleted successfully.',
          scheduledFor: null,
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
});
