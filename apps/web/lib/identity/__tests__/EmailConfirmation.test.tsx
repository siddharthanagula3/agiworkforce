import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequestAuthority, type RequestAuthority } from '../request-authority';
import { useSessionSnapshot } from '../useSessionSnapshot';

const mocks = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  sessionId: 'session-current',
  nativeSession: null as {
    id: string;
    user: Record<string, unknown>;
    getToken: () => Promise<string>;
  } | null,
}));

vi.mock('@clerk/nextjs', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: 'user-1',
    sessionId: mocks.sessionId,
    getToken: vi.fn(),
  }),
  useClerk: () => clerk,
  useUser: () => ({ isLoaded: true, isSignedIn: true, user: mocks.user }),
  useSession: () => ({ session: mocks.nativeSession }),
  useSignUp: () => ({ fetchStatus: 'idle', signUp: {} }),
}));
vi.mock('@agiworkforce/local-runtime-contract', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/local-runtime-contract')>()),
  getHostBridge: () => null,
}));

const clerk = {
  loaded: true,
  get user() {
    return mocks.user;
  },
  get session() {
    return mocks.nativeSession;
  },
  signOut: vi.fn(),
  addListener: (_listener: () => void) => () => undefined,
};
let requests: RequestAuthority[] = [];

function connectScope() {
  const snapshot = renderHook(useSessionSnapshot).result.current();
  if (!snapshot) throw new Error('Fixture must have a current native session');
  const authority = createRequestAuthority(snapshot);
  requests.push(authority);
  return { authority, onDispatch: vi.fn() };
}

afterEach(() => {
  for (const request of requests) request.retire();
  requests = [];
  vi.unstubAllGlobals();
});

import {
  UNCONFIRMED_EMAIL_CONNECT_MESSAGE,
  useConnectedAccounts,
  usePrimaryEmailConfirmation,
} from '../client';

function session(id: string) {
  return { id, revoke: vi.fn(async () => undefined) };
}

function accountWithAddress(status: string) {
  const address = {
    emailAddress: 'victim@corp.example',
    verification: { status },
    prepareVerification: vi.fn(async () => undefined),
    attemptVerification: vi.fn(async () => undefined),
  };
  const sessions = [
    session('session-current'),
    session('session-earlier'),
    session('session-other'),
  ];
  const createExternalAccount = vi.fn(async () => ({
    verification: { externalVerificationRedirectURL: new URL('https://accounts.example/oauth') },
  }));
  mocks.user = {
    id: 'user-1',
    primaryEmailAddress: address,
    externalAccounts: [],
    getSessions: vi.fn(async () => sessions),
    createExternalAccount,
    reload: vi.fn(async () => undefined),
  };
  mocks.nativeSession = {
    id: mocks.sessionId,
    user: mocks.user,
    getToken: vi.fn(async () => 'fixture-token'),
  };
  return { address, sessions, createExternalAccount };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = null;
  mocks.nativeSession = null;
});

describe('confirming the primary address of the signed-in account', () => {
  it('sends the code to that address and checks the one the person enters', async () => {
    const { address } = accountWithAddress('unverified');
    const { result } = renderHook(() => usePrimaryEmailConfirmation());

    expect(result.current.email).toBe('victim@corp.example');
    await act(() => result.current.sendCode());
    await act(() => result.current.confirm('424242'));

    expect(address.prepareVerification).toHaveBeenCalledWith({ strategy: 'email_code' });
    expect(address.attemptVerification).toHaveBeenCalledWith({ code: '424242' });
  });

  it('ends every session on the account except the one confirming it', async () => {
    const { sessions } = accountWithAddress('verified');
    const { result } = renderHook(() => usePrimaryEmailConfirmation());

    await act(() => result.current.endOtherSessions());

    const [current, earlier, other] = sessions;
    expect(current?.revoke).not.toHaveBeenCalled();
    expect(earlier?.revoke).toHaveBeenCalledTimes(1);
    expect(other?.revoke).toHaveBeenCalledTimes(1);
  });

  it('treats a session list without this session as unread, not as nothing to end', async () => {
    const { sessions } = accountWithAddress('verified');
    (mocks.user as { getSessions: ReturnType<typeof vi.fn> }).getSessions.mockResolvedValue([]);
    const { result } = renderHook(() => usePrimaryEmailConfirmation());

    await expect(act(() => result.current.endOtherSessions())).rejects.toThrow('could not be read');
    for (const candidate of sessions) expect(candidate.revoke).not.toHaveBeenCalled();
  });
});

describe('linking another way to sign in', () => {
  it('refuses while the account email has never been confirmed', async () => {
    const { createExternalAccount } = accountWithAddress('unverified');
    const { result } = renderHook(() => useConnectedAccounts());

    await expect(
      result.current
        .capture(
          { kind: 'connect', provider: 'google', returnUrl: 'https://agiworkforce.com/settings' },
          connectScope(),
        )
        .execute(),
    ).rejects.toThrow(UNCONFIRMED_EMAIL_CONNECT_MESSAGE);
    expect(createExternalAccount).not.toHaveBeenCalled();
  });

  it('starts the provider once the account email is confirmed', async () => {
    const { createExternalAccount } = accountWithAddress('verified');
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const { result } = renderHook(() => useConnectedAccounts());

    const scope = connectScope();
    await act(() =>
      result.current
        .capture(
          { kind: 'connect', provider: 'google', returnUrl: 'https://agiworkforce.com/settings' },
          scope,
        )
        .execute(),
    );

    expect(createExternalAccount).toHaveBeenCalledWith({
      strategy: 'oauth_google',
      redirectUrl: 'https://agiworkforce.com/settings',
    });
    expect(assign).toHaveBeenCalledWith('https://accounts.example/oauth');
    vi.unstubAllGlobals();
  });
});
