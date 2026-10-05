import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  sessionId: 'session-current',
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-1', getToken: vi.fn() }),
  useClerk: () => ({ signOut: vi.fn() }),
  useUser: () => ({ isLoaded: true, isSignedIn: true, user: mocks.user }),
  useSession: () => ({ session: { id: mocks.sessionId } }),
  useSignUp: () => ({ fetchStatus: 'idle', signUp: {} }),
}));
vi.mock('@agiworkforce/local-runtime-contract', () => ({ getHostBridge: () => null }));

import { usePrimaryEmailConfirmation } from '../client';

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
  mocks.user = {
    id: 'user-1',
    primaryEmailAddress: address,
    externalAccounts: [],
    getSessions: vi.fn(async () => sessions),
    reload: vi.fn(async () => undefined),
  };
  return { address, sessions };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = null;
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
