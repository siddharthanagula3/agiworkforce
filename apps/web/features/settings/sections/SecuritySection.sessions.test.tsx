import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  signOut: vi.fn(),
  logout: vi.fn(),
  addCsrfHeaders: vi.fn(async () => ({ 'x-csrf-token': 'csrf' })),
  get2FAStatus: vi.fn(),
  settings: { two_factor_enabled: false, session_timeout: 60 },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.routerReplace }),
}));

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true, isSignedIn: true, user: null }),
  useClerk: () => ({ signOut: mocks.signOut }),
}));

vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: 'user-1' }, logout: mocks.logout }),
}));

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: mocks.addCsrfHeaders,
}));

vi.mock('@features/settings/services/user-preferences', () => ({
  default: { get2FAStatus: mocks.get2FAStatus },
  settingsService: { get2FAStatus: mocks.get2FAStatus },
}));

vi.mock('@features/settings/hooks/use-settings-queries', async (importOriginal) => ({
  ...(await importOriginal()),
  useUserSettings: () => ({ data: mocks.settings, isLoading: false }),
  useUpdateSettings: () => ({ mutate: vi.fn(), isPending: false }),
  useChangePassword: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@features/settings/components/Settings/SignInMethodsPanel', () => ({
  SignInMethodsPanel: ({ onOpenPassword }: { onOpenPassword?: () => void }) =>
    onOpenPassword ? (
      <button type="button" onClick={onOpenPassword}>
        Add password
      </button>
    ) : null,
}));
vi.mock('@features/settings/components/Settings/PasskeysPanel', () => ({
  PasskeysPanel: () => null,
}));
vi.mock('@/features/account-security/components/AdvancedAccountSecurityPanel', () => ({
  AdvancedAccountSecurityPanel: () => null,
}));
vi.mock('@features/settings/components/Settings/TwoFactorEnrollment', () => ({
  TwoFactorEnrollmentPanel: () => null,
}));
vi.mock('@features/settings/components/AuditLogPanel', () => ({
  AuditLogPanel: () => null,
}));
vi.mock('@features/settings/components/DeviceSignInToggle', () => ({
  DeviceSignInToggle: () => null,
}));

import { SecuritySection } from './SecuritySection';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubSessionsDelete(response: () => Response) {
  const requests: Array<{ url: string; method: string }> = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = { url: String(input), method: init?.method ?? 'GET' };
    requests.push(request);
    if (request.url === '/api/settings/sessions' && request.method === 'DELETE') return response();
    throw new Error(`Unexpected request: ${request.url} ${request.method}`);
  });
  return requests;
}

describe('SecuritySection sessions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.logout.mockResolvedValue(undefined);
    mocks.signOut.mockResolvedValue(undefined);
  });

  it('renders a Sessions block that links to the session list in Account', () => {
    render(<SecuritySection />);

    expect(screen.getByRole('heading', { level: 2, name: 'Sessions' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Active sessions/ })).toHaveAttribute(
      'href',
      '/settings/account',
    );
    expect(screen.getByRole('button', { name: 'Log out of all devices' })).toBeEnabled();
  });

  it('asks first, then uses the account-wide endpoint before clearing local state', async () => {
    const requests = stubSessionsDelete(() =>
      jsonResponse({ message: 'All active sessions revoked', revokedCount: 2 }),
    );

    render(<SecuritySection />);
    fireEvent.click(screen.getByRole('button', { name: 'Log out of all devices' }));
    expect(await screen.findByText('Log out of all devices?')).toBeInTheDocument();
    expect(requests).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Log out everywhere' }));

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledWith({ redirectUrl: '/login' }));
    expect(requests).toContainEqual({ url: '/api/settings/sessions', method: 'DELETE' });
    expect(mocks.addCsrfHeaders).toHaveBeenCalled();
    expect(mocks.logout).toHaveBeenCalledOnce();
  });

  it('ends no session when the confirmation is dismissed', async () => {
    const requests = stubSessionsDelete(() => jsonResponse({}));

    render(<SecuritySection />);
    fireEvent.click(screen.getByRole('button', { name: 'Log out of all devices' }));
    expect(
      await screen.findByText(/Every signed-in session on every device ends immediately/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByText('Log out of all devices?')).toBeNull());
    expect(requests).toEqual([]);
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.logout).not.toHaveBeenCalled();
  });

  it('surfaces the partial progress a rate limited log out reports', async () => {
    stubSessionsDelete(() =>
      jsonResponse(
        {
          error: 'Ended 120 of 1647 sessions, try again to finish.',
          revokedCount: 120,
          failedCount: 1527,
          currentSessionRevoked: false,
        },
        502,
      ),
    );

    render(<SecuritySection />);
    fireEvent.click(screen.getByRole('button', { name: 'Log out of all devices' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Log out everywhere' }));

    const failure = await screen.findByText('Ended 120 of 1647 sessions, try again to finish.');
    expect(failure).toHaveAttribute('role', 'alert');
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Log out of all devices' })).toBeEnabled();
  });

  it('moves focus to the password form from the sign-in methods row', async () => {
    render(<SecuritySection />);

    fireEvent.click(screen.getByRole('button', { name: 'Add password' }));

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByPlaceholderText('Enter new password')),
    );
  });
});
