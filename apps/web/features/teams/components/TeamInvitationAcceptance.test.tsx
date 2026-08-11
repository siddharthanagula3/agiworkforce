import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({ isLoaded: true, isSignedIn: false }));
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
    const teamSettingsLink = screen.getByRole('link', { name: 'Open Team settings' });
    expect(teamSettingsLink).toHaveAttribute('href', '/settings/team');
    expect(teamSettingsLink).not.toHaveAttribute('data-next-link');
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
