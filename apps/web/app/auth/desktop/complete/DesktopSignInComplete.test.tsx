import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DesktopSignInComplete } from './DesktopSignInComplete';

const signInWithTicket = vi.hoisted(() => vi.fn(async () => null));

vi.mock('@/features/auth/IdentityAuthAdapter', () => ({
  useIdentityTicketSignIn: () => ({ ready: true, signInWithTicket }),
}));

vi.mock('@/features/desktop-host/lib/browser-sign-in', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  beginBrowserSignIn: vi.fn(async () => false),
}));

const COMPLETE_URL = '/login/complete';
const LOGIN_URL = '/login';
const fetchMock = vi.fn(
  async () =>
    new Response(JSON.stringify({ ticket: 'ticket-1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
);

function openWithGrant(): void {
  window.history.replaceState(null, '', '/auth/desktop/complete#code=code-1&verifier=verifier-1');
}

function setHost(host: unknown): void {
  (window as unknown as { agiHost?: unknown }).agiHost = host;
}

describe('desktop sign-in completion', () => {
  beforeEach(() => {
    signInWithTicket.mockClear();
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    openWithGrant();
  });

  afterEach(() => {
    setHost(undefined);
    vi.unstubAllGlobals();
  });

  it('refuses a grant opened outside the desktop window that started the sign-in', async () => {
    render(<DesktopSignInComplete completeUrl={COMPLETE_URL} loginUrl={LOGIN_URL} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be finished');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(signInWithTicket).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });

  it('refuses a grant in a host that cannot run browser sign-in', async () => {
    setHost({ shell: 'tauri' });

    render(<DesktopSignInComplete completeUrl={COMPLETE_URL} loginUrl={LOGIN_URL} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be finished');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('redeems the grant inside the desktop window and signs in with its ticket', async () => {
    setHost({ shell: 'electron', browserSignIn: { cancellation: true } });

    render(<DesktopSignInComplete completeUrl={COMPLETE_URL} loginUrl={LOGIN_URL} />);

    await waitFor(() => expect(signInWithTicket).toHaveBeenCalledWith('ticket-1', COMPLETE_URL));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/desktop/redeem',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ code: 'code-1', verifier: 'verifier-1' }),
      }),
    );
  });
});
