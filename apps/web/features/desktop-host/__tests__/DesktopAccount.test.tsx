import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostBridge } from '@agiworkforce/local-runtime-contract';

const reportDesktopAccount = vi.fn(async () => true);
let currentUser: { isLoaded: boolean; isSignedIn: boolean; user: { email?: string } | null } = {
  isLoaded: true,
  isSignedIn: false,
  user: null,
};

vi.mock('../lib/runtime-client', () => ({ reportDesktopAccount }));
vi.mock('@/lib/identity/client', () => ({ useCurrentUser: () => currentUser }));

const { useDesktopAccount } = await import('../hooks/use-desktop-account');

function Harness({ host }: { host: HostBridge | null }) {
  useDesktopAccount(host);
  return null;
}

const host = { platform: 'electron-darwin', appVersion: '1.2.0' } as unknown as HostBridge;

function signedIn(email: string) {
  return { isLoaded: true, isSignedIn: true, user: { email, emails: [email] } };
}

beforeEach(() => {
  reportDesktopAccount.mockClear();
  currentUser = { isLoaded: true, isSignedIn: false, user: null };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the desktop account report', () => {
  it('tells the shell which account this window is signed in as', async () => {
    currentUser = signedIn('qa@agiworkforce.com');

    render(<Harness host={host} />);

    await waitFor(() =>
      expect(reportDesktopAccount).toHaveBeenCalledWith(true, 'qa@agiworkforce.com'),
    );
  });

  // Signing out has to reach the shell, or the machine keeps a credential for
  // an account the user has left. Reading the cookie jar after the navigation
  // was not enough: it still answered with the account they signed out of.
  it('tells the shell about a sign-out', async () => {
    currentUser = signedIn('qa@agiworkforce.com');
    const view = render(<Harness host={host} />);
    await waitFor(() =>
      expect(reportDesktopAccount).toHaveBeenCalledWith(true, expect.any(String)),
    );

    currentUser = { isLoaded: true, isSignedIn: false, user: null };
    view.rerender(<Harness host={host} />);

    await waitFor(() => expect(reportDesktopAccount).toHaveBeenLastCalledWith(false, null));
  });

  it('says nothing before the account has loaded, and nothing at all in a browser', async () => {
    currentUser = { isLoaded: false, isSignedIn: false, user: null };
    const view = render(<Harness host={host} />);
    expect(reportDesktopAccount).not.toHaveBeenCalled();

    currentUser = signedIn('qa@agiworkforce.com');
    view.rerender(<Harness host={null} />);
    expect(reportDesktopAccount).not.toHaveBeenCalled();
  });
});
