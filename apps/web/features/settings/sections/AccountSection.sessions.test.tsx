import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountSection } from './AccountSection';

const { mockRouterReplace, mockSignOut, mockLogout, mockAddCsrfHeaders } = vi.hoisted(() => ({
  mockRouterReplace: vi.fn(),
  mockSignOut: vi.fn(),
  mockLogout: vi.fn(),
  mockAddCsrfHeaders: vi.fn(async () => ({ 'x-csrf-token': 'csrf' })),
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

// This suite only exercises session management, not account deletion (see
// AccountSection.delete.test.tsx for the real useDeleteAccount integration,
// including a QueryClientProvider). Stub the hook here so mounting
// AccountSection doesn't require a QueryClient just to render session rows.
vi.mock('../hooks/use-settings-queries', async (importOriginal) => ({
  ...(await importOriginal()),
  useOrganizationOverview: () => ({ data: undefined }),
  useDeleteAccount: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isSuccess: false,
    error: null,
    data: undefined,
    signOutAfterDeletion: vi.fn(async () => {}),
  }),
  useAccountDeletionStatus: () => ({
    data: { pending: false, canCancel: false, requestedAt: null, scheduledFor: null },
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCancelAccountDeletion: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    error: null,
  }),
}));

const sessions = [
  {
    id: 'sess_current',
    status: 'active',
    device: 'Mac',
    browser: 'Chrome 140',
    location: 'Austin, US',
    createdAt: '2026-07-01T12:00:00.000Z',
    lastActiveAt: '2026-07-03T12:00:00.000Z',
    expiresAt: '2026-08-01T12:00:00.000Z',
    isCurrent: true,
  },
  {
    id: 'sess_phone',
    status: 'active',
    device: 'iPhone',
    browser: 'Mobile Safari 19',
    location: 'Chicago, US',
    createdAt: '2026-07-02T12:00:00.000Z',
    lastActiveAt: '2026-07-04T12:00:00.000Z',
    expiresAt: '2026-08-02T12:00:00.000Z',
    isCurrent: false,
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('AccountSection active sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogout.mockResolvedValue(undefined);
    mockSignOut.mockResolvedValue(undefined);
  });

  it('shows account-wide device activity and revokes a single non-current session', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input) === '/api/settings/sessions' && init?.method === 'GET') {
        return jsonResponse({ sessions, totalCount: sessions.length });
      }
      if (String(input) === '/api/settings/sessions/sess_phone' && init?.method === 'DELETE') {
        return jsonResponse({ message: 'Session revoked', isCurrent: false });
      }
      throw new Error(`Unexpected request: ${String(input)} ${init?.method ?? 'GET'}`);
    });

    render(<AccountSection />);

    expect(await screen.findByText('Mobile Safari 19')).toBeInTheDocument();
    expect(screen.getByText('Chicago, US')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke iPhone session' }));
    // Revoking now asks first: nothing is sent until the dialog is accepted.
    expect(await screen.findByText('Revoke the iPhone session?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke session' }));

    await waitFor(() => expect(screen.queryByText('Mobile Safari 19')).not.toBeInTheDocument());
    expect(mockAddCsrfHeaders).toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('uses the account-wide endpoint before clearing local state for all-device logout', async () => {
    const requests: Array<{ url: string; method: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = { url: String(input), method: init?.method ?? 'GET' };
      requests.push(request);
      if (request.url === '/api/settings/sessions' && request.method === 'GET') {
        return jsonResponse({ sessions, totalCount: sessions.length });
      }
      if (request.url === '/api/settings/sessions' && request.method === 'DELETE') {
        return jsonResponse({ message: 'All active sessions revoked', revokedCount: 2 });
      }
      throw new Error(`Unexpected request: ${request.url} ${request.method}`);
    });

    render(<AccountSection />);
    await screen.findByText('Chrome 140');
    fireEvent.click(screen.getByRole('button', { name: 'Log out of all devices' }));
    expect(await screen.findByText('Log out of all devices?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Log out everywhere' }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ redirectUrl: '/login' }));
    expect(requests).toContainEqual({ url: '/api/settings/sessions', method: 'DELETE' });
    expect(mockLogout).toHaveBeenCalledOnce();
  });

  it('replaces a timed-out session request with an actionable retry state', async () => {
    const timeoutSignal = AbortSignal.abort(new DOMException('Timed out', 'TimeoutError'));
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutSignal);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('Timed out', 'TimeoutError'));

    render(<AccountSection />);

    expect(
      await screen.findByText('Active sessions took too long to load. Please try again.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Loading active sessions…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    timeoutSpy.mockRestore();
  });
});
