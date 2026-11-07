import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const identity = vi.hoisted(() => ({
  hasPassword: false,
  userLoaded: true,
  passkeysLoaded: true,
  accountsLoaded: true,
  signedIn: true,
  userId: 'person',
  ownerId: 'person' as string | null,
  readError: null as string | null,
  readLoading: false,
  populated: false,
  nativeUser: { id: 'person' },
  passkeys: [] as Array<{ id: string; name: string | null; createdAt: Date; lastUsedAt: null }>,
}));

vi.mock('@/lib/identity/useSessionSnapshot', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/identity/useSessionSnapshot')>(),
  useSessionSnapshot: () => () => identity.signedIn && identity.userLoaded && identity.ownerId === identity.userId ? ({
    userId: identity.userId, sessionId: 'session', getToken: async () => 'token',
    isCurrent: () => identity.signedIn && identity.userLoaded && identity.ownerId === identity.userId,
  }) : null,
}));
vi.mock('@/lib/identity/native-session-authority', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/identity/native-session-authority')>(),
  nativeSessionFor: () => ({ user: identity.nativeUser }),
}));
vi.mock('@/lib/identity/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/identity/client')>(),
  useCurrentUser: () => ({
    isLoaded: identity.userLoaded,
    isSignedIn: identity.signedIn,
    user: { id: identity.userId, email: 'person@example.com', hasPassword: identity.hasPassword },
  }),
  usePasskeys: () => ({ isLoaded: identity.passkeysLoaded, passkeys: identity.passkeys }),
  useConnectedAccounts: () => ({
    isLoaded: identity.accountsLoaded,
    accounts: [],
    isCurrent: () => identity.accountsLoaded,
    capture: vi.fn(),
  }),
}));

vi.mock('@features/settings/hooks/useStepUp', async (importOriginal) => ({
  ...await importOriginal<typeof import('@features/settings/hooks/useStepUp')>(),
  useStepUp: () => ({ withStepUp: vi.fn(), dialog: null }),
}));

vi.mock('@/features/auth/step-up-fetch', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/features/auth/step-up-fetch')>(),
  isStepUpCancelled: () => false,
  fetchWithStepUp: vi.fn(),
  requestStepUpGrant: vi.fn(),
  sendAuthorizedJson: vi.fn(async () =>
    Response.json({ identities: [], providers: [], consequence: '' }),
  ),
}));

vi.mock('./use-sign-in-identities', async (importOriginal) => ({
  ...await importOriginal<typeof import('./use-sign-in-identities')>(),
  useSignInIdentities: () => ({
    ownerId: identity.ownerId,
    data: identity.readError || identity.readLoading ? null : {
      identities: identity.populated ? [1, 2].map((id) => ({
        id: `00000000-0000-4000-8000-00000000000${id}`, provider: 'backend', creationSource: 'link',
        createdAt: '2026-01-01T00:00:00.000Z', lastAuthenticatedAt: null, removable: id === 2,
      })) : [],
      providers: identity.populated ? [{ id: 'google', label: 'Google' }] : [],
      consequence: 'You cannot sign in with it.',
    },
    error: identity.readError,
    isLoading: identity.readLoading,
    reload: vi.fn(),
    isCurrent: () => !identity.readError && !identity.readLoading,
  }),
}));

import { SignInMethodsPanel } from './SignInMethodsPanel';

function formatted(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

describe('SignInMethodsPanel', () => {
  beforeEach(() => {
    identity.hasPassword = false;
    identity.passkeys = [];
    identity.userLoaded = true;
    identity.passkeysLoaded = true;
    identity.accountsLoaded = true;
    identity.signedIn = true;
    identity.userId = 'person';
    identity.ownerId = 'person';
    identity.readError = null;
    identity.readLoading = false;
    identity.populated = false;
  });

  it('offers Add on the password row and opens the password form', async () => {
    const onOpenPassword = vi.fn();
    render(<SignInMethodsPanel onOpenPassword={onOpenPassword} />);

    const row = await screen.findByRole('button', { name: 'Add password' });
    expect(row).toHaveTextContent('Not set');
    fireEvent.click(row);
    expect(onOpenPassword).toHaveBeenCalledOnce();
  });

  it('offers Change when the account already has a password', async () => {
    identity.hasPassword = true;
    render(<SignInMethodsPanel onOpenPassword={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'Change password' })).toHaveTextContent('Set');
  });

  it('renders the password row without an action when there is no form to open', async () => {
    render(<SignInMethodsPanel />);

    expect(await screen.findByText('Not set')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /password/i })).toBeNull();
  });

  it('dates the passkeys row by the most recently added passkey', async () => {
    const older = new Date('2026-03-02T12:00:00Z');
    const newest = new Date('2026-07-21T12:00:00Z');
    identity.passkeys = [
      { id: 'pk_new', name: 'Phone', createdAt: newest, lastUsedAt: null },
      { id: 'pk_old', name: 'Laptop', createdAt: older, lastUsedAt: null },
    ];
    render(<SignInMethodsPanel />);

    expect(
      await screen.findByText(
        `2 saved. Manage them under Passkeys. Last added on ${formatted(newest)}.`,
      ),
    ).toBeInTheDocument();
  });
  it.each(['loading', 'failed'])('preserves current native rows while identities GET is %s', async (state) => {
    identity.populated = true;
    identity.readLoading = state === 'loading';
    identity.readError = state === 'failed' ? 'Your sign-in methods could not be loaded.' : null;
    render(<SignInMethodsPanel onOpenPassword={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Add password' })).toBeInTheDocument();
    expect(screen.getByText('person@example.com')).toBeInTheDocument();
    expect(screen.getByText('None yet. Add one under Passkeys.')).toBeInTheDocument();
    expect(screen.queryByText('Google')).toBeNull();
    expect(screen.queryByText('Linked account')).toBeNull();
    if (state === 'failed') expect(screen.getByRole('alert')).toHaveTextContent(identity.readError!);
  });

  it('waits for connected-account readiness before offering provider actions', () => {
    identity.populated = true;
    identity.accountsLoaded = false;
    const { rerender } = render(<SignInMethodsPanel />);
    expect(screen.queryByText('Google')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull();
    expect(screen.getAllByText('Linked account')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    identity.accountsLoaded = true;
    rerender(<SignInMethodsPanel />);
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  });

  it('does not report empty passkeys before native readiness', () => {
    identity.passkeysLoaded = false;
    render(<SignInMethodsPanel />);
    expect(screen.queryByText('None yet. Add one under Passkeys.')).toBeNull();
    expect(screen.getByText('person@example.com')).toBeInTheDocument();
  });

  it.each(['loading', 'signed-out', 'mismatch', 'no-owner'])('hides native statuses for %s', (state) => {
    identity.populated = true;
    identity.userLoaded = state !== 'loading';
    identity.signedIn = state !== 'signed-out';
    identity.userId = state === 'mismatch' ? 'other' : 'person';
    identity.ownerId = state === 'no-owner' ? null : 'person';
    render(<SignInMethodsPanel onOpenPassword={vi.fn()} />);
    expect(screen.queryByText('person@example.com')).toBeNull();
    expect(screen.queryByText('Not set')).toBeNull();
    expect(screen.queryByText('Google')).toBeNull();
    expect(screen.queryByText('Linked account')).toBeNull();
    expect(screen.queryByText('None yet. Add one under Passkeys.')).toBeNull();
  });
});
