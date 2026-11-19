jest.mock('@clerk/expo', () => ({
  getClerkInstance: () => {
    throw new Error('Clerk is not configured');
  },
}));

import {
  getDeviceAccountsClerk,
  planSignOutHandover,
  readDeviceAccounts,
  readMultiSessionAllowed,
  type DeviceAccountsClerk,
} from '../deviceAccounts';
import { resolveRootRedirect } from '@/src/features/auth/services/rootRouting';
import {
  beginCloudAccountAddition,
  endCloudAccountAddition,
  isCloudAccountAdditionOpenFor,
} from '@/src/features/auth/services/accountAddition';
import { peekPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import { completePendingPostAuthIntentForLoadedSession } from '@/src/features/auth/actions/postAuthIntent';

function clerkWith(
  environment: unknown,
  sessions: { id: string; userId: string; email: string; status?: string }[],
  activeId: string | null,
): DeviceAccountsClerk {
  return {
    __internal_environment: environment,
    session: activeId ? { id: activeId } : null,
    client: {
      signedInSessions: sessions.map((session) => ({
        id: session.id,
        status: session.status ?? 'active',
        user: null,
        publicUserData: {
          identifier: session.email,
          userId: session.userId,
          firstName: 'Test',
          lastName: 'Person',
          imageUrl: '',
        },
      })),
    },
  } as unknown as DeviceAccountsClerk;
}

const TWO_ACCOUNTS = [
  { id: 'sess_a', userId: 'user_a', email: 'first@example.com' },
  { id: 'sess_b', userId: 'user_b', email: 'second@example.com' },
];

describe('device accounts', () => {
  it('treats an unknown or single-session instance as single-session', () => {
    expect(readMultiSessionAllowed(clerkWith(undefined, [], null))).toBe(false);
    expect(readMultiSessionAllowed(clerkWith(null, [], null))).toBe(false);
    expect(readMultiSessionAllowed(clerkWith({ authConfig: {} }, [], null))).toBe(false);
    expect(
      readMultiSessionAllowed(clerkWith({ authConfig: { singleSessionMode: true } }, [], null)),
    ).toBe(false);
    expect(
      readMultiSessionAllowed(clerkWith({ authConfig: { singleSessionMode: false } }, [], null)),
    ).toBe(true);
  });

  it('has no accounts when Clerk cannot be reached', () => {
    expect(getDeviceAccountsClerk()).toBeNull();
    expect(readDeviceAccounts(null)).toEqual({ multiSession: false, accounts: [] });
  });

  it('lists only signed-in sessions and marks the active one', () => {
    const accounts = readDeviceAccounts(
      clerkWith(
        { authConfig: { singleSessionMode: false } },
        [
          ...TWO_ACCOUNTS,
          { id: 'sess_c', userId: 'user_c', email: 'third@example.com', status: 'pending' },
        ],
        'sess_b',
      ),
    );

    expect(accounts.multiSession).toBe(true);
    expect(accounts.accounts).toEqual([
      expect.objectContaining({ sessionId: 'sess_a', email: 'first@example.com', active: false }),
      expect.objectContaining({
        sessionId: 'sess_b',
        email: 'second@example.com',
        name: 'Test Person',
        active: true,
      }),
    ]);
  });

  it('hands sign-out over to another account only on a multi-session instance', () => {
    const multi = readDeviceAccounts(
      clerkWith({ authConfig: { singleSessionMode: false } }, TWO_ACCOUNTS, 'sess_a'),
    );
    expect(planSignOutHandover(multi)).toEqual({
      ending: expect.objectContaining({ sessionId: 'sess_a' }),
      next: expect.objectContaining({ sessionId: 'sess_b' }),
    });

    const single = readDeviceAccounts(
      clerkWith({ authConfig: { singleSessionMode: true } }, TWO_ACCOUNTS, 'sess_a'),
    );
    expect(planSignOutHandover(single)).toBeNull();

    const alone = readDeviceAccounts(
      clerkWith({ authConfig: { singleSessionMode: false } }, TWO_ACCOUNTS.slice(0, 1), 'sess_a'),
    );
    expect(planSignOutHandover(alone)).toBeNull();
  });
});

describe('adding an account', () => {
  const signedInOnLogin = {
    segments: ['(auth)', 'login'],
    authEnabled: true,
    isClerkLoaded: true,
    isClerkSignedIn: true,
    onboardingDone: true,
    ageGateConfirmed: true,
    signInOwedForEndedSession: false,
  };

  afterEach(() => endCloudAccountAddition({ cancelled: true }));

  it('keeps a signed-in person on the sign-in screen only while they add an account', () => {
    expect(resolveRootRedirect(signedInOnLogin)).toEqual({ pathname: '/(app)' });
    expect(resolveRootRedirect({ ...signedInOnLogin, addingAccount: true })).toBeNull();
    expect(
      resolveRootRedirect({
        ...signedInOnLogin,
        segments: ['(auth)', 'reset-password'],
        addingAccount: true,
      }),
    ).toEqual({ pathname: '/(app)' });
  });

  it('is open only for the account that started it, and closing clears the staged Cloud intent', () => {
    const route = beginCloudAccountAddition('user_a');

    expect(route).toEqual({ pathname: '/(auth)/login', params: { addAccount: '1' } });
    expect(isCloudAccountAdditionOpenFor('user_a')).toBe(true);
    expect(isCloudAccountAdditionOpenFor('user_b')).toBe(false);
    expect(isCloudAccountAdditionOpenFor(null)).toBe(false);
    expect(peekPostAuthIntent()).toBe('cloud-chat');

    endCloudAccountAddition({ cancelled: true });

    expect(isCloudAccountAdditionOpenFor('user_a')).toBe(false);
    expect(peekPostAuthIntent()).toBeNull();
  });

  it('never lets the account already signed in consume the new account intent', () => {
    beginCloudAccountAddition('user_a');
    const loaded = {
      isLoaded: true,
      isSignedIn: true,
      termsAccepted: true,
      cloudUnlocked: true,
      subscriptionTier: 'free',
    };

    expect(completePendingPostAuthIntentForLoadedSession({ ...loaded, userId: 'user_a' })).toBe(
      false,
    );
    expect(peekPostAuthIntent()).toBe('cloud-chat');
  });
});
