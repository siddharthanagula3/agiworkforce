import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  isLoaded: true,
  isSignedIn: false,
  userId: null as string | null,
  sessionId: null as string | null,
}));
const getAuthToken = vi.hoisted(() => vi.fn(async () => 'auth-token'));
const getCsrfToken = vi.hoisted(() => vi.fn(async () => 'csrf-token'));

vi.mock('@clerk/nextjs', () => ({ useAuth: () => authState }));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => (
    <a data-next-link="true" {...props}>
      {children}
    </a>
  ),
}));
vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));
vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken }));
vi.mock('@/lib/client/csrf', () => ({ getCsrfToken }));

import { TeamInvitationAcceptance } from './TeamInvitationAcceptance';

const INVITE_TOKEN = 'private-invitation-token-long-enough';

describe('TeamInvitationAcceptance', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    authState.isLoaded = true;
    authState.isSignedIn = false;
    authState.userId = null;
    authState.sessionId = null;
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/invite');
  });

  it('keeps the private token in session storage across sign-in without putting it in redirect URLs', () => {
    window.history.replaceState(null, '', `/invite#token=${INVITE_TOKEN}`);

    render(<TeamInvitationAcceptance />);

    expect(screen.getByRole('link', { name: 'Sign in to continue' })).toHaveAttribute(
      'href',
      '/login?redirectTo=%2Finvite',
    );
    expect(window.location.href).not.toContain(INVITE_TOKEN);
    expect(window.sessionStorage.getItem('agi.team.invitation-token')).toBe(INVITE_TOKEN);
  });

  it('accepts explicitly and clears the one-time token after success', async () => {
    authState.isSignedIn = true;
    window.sessionStorage.setItem('agi.team.invitation-token', INVITE_TOKEN);
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ membership: { role: 'member' } }),
    } as Response);

    render(<TeamInvitationAcceptance />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));

    await waitFor(() => expect(screen.getByText('Invitation accepted as member.')).toBeVisible());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/settings/team/invitations/accept',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: INVITE_TOKEN, action: 'accept' }),
      }),
    );
    expect(window.sessionStorage.getItem('agi.team.invitation-token')).toBeNull();
    const teamSettingsLink = screen.getByRole('link', { name: 'Open team settings' });
    expect(teamSettingsLink).toHaveAttribute('href', '/settings/team');
    expect(teamSettingsLink).not.toHaveAttribute('data-next-link');
  });

  it('drops an acceptance receipt once the signed-in account changes', async () => {
    authState.isSignedIn = true;
    authState.userId = 'user-a';
    authState.sessionId = 'session-a';
    window.sessionStorage.setItem('agi.team.invitation-token', INVITE_TOKEN);
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ membership: { role: 'member' } }),
    } as Response);

    const view = render(<TeamInvitationAcceptance />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await waitFor(() => expect(screen.getByText('Invitation accepted as member.')).toBeVisible());

    authState.userId = 'user-b';
    authState.sessionId = 'session-b';
    view.rerender(<TeamInvitationAcceptance />);

    expect(screen.queryByText('Invitation accepted as member.')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Open team settings' })).toBeNull();
  });

  it('drops an acceptance receipt after sign-out', async () => {
    authState.isSignedIn = true;
    authState.userId = 'user-a';
    authState.sessionId = 'session-a';
    window.sessionStorage.setItem('agi.team.invitation-token', INVITE_TOKEN);
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ membership: { role: 'member' } }),
    } as Response);

    const view = render(<TeamInvitationAcceptance />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await waitFor(() => expect(screen.getByText('Invitation accepted as member.')).toBeVisible());

    authState.isSignedIn = false;
    authState.userId = null;
    authState.sessionId = null;
    view.rerender(<TeamInvitationAcceptance />);

    expect(screen.queryByText('Invitation accepted as member.')).toBeNull();
  });

  it('does not publish a response that settles after the account changed', async () => {
    authState.isSignedIn = true;
    authState.userId = 'user-a';
    authState.sessionId = 'session-a';
    window.sessionStorage.setItem('agi.team.invitation-token', INVITE_TOKEN);
    let release!: (response: Response) => void;
    vi.spyOn(global, 'fetch').mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
    );

    const view = render(<TeamInvitationAcceptance />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce());

    authState.userId = 'user-b';
    authState.sessionId = 'session-b';
    view.rerender(<TeamInvitationAcceptance />);
    release({ ok: true, json: async () => ({ membership: { role: 'member' } }) } as Response);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText('Invitation accepted as member.')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Open team settings' })).toBeNull();
  });

  it('shows the server email-boundary error and retains the token for a retry', async () => {
    authState.isSignedIn = true;
    window.sessionStorage.setItem('agi.team.invitation-token', INVITE_TOKEN);
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: { message: 'This invitation was issued to a different email address.' },
      }),
    } as Response);

    render(<TeamInvitationAcceptance />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('different email address');
    expect(window.sessionStorage.getItem('agi.team.invitation-token')).toBe(INVITE_TOKEN);
  });
});
