import { vi, type Mock } from 'vitest';
import type { SessionAuthority, RequestAuthority } from '../request-authority';
import { bindNativeSession } from '../native-session-authority';
import { createRequestAuthority } from '../request-authority';

export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

interface FixtureKey {
  id: string;
  name: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  update: Mock<(input: { name: string }) => Promise<unknown>>;
  delete: Mock<() => Promise<void>>;
}

interface FixtureUser {
  id: string;
  passkeys: FixtureKey[];
  createPasskey: Mock<() => Promise<void>>;
  reload: Mock<() => Promise<{ id: string }>>;
}

interface FixtureSession {
  id: string;
  user: FixtureUser;
  getToken: Mock<() => Promise<string>>;
}

interface PasskeyFixture {
  key: FixtureKey;
  user: FixtureUser;
  session: FixtureSession;
  clerk: {
    loaded: boolean;
    user: FixtureUser;
    session: FixtureSession;
    signOut: Mock;
    addListener: NonNullable<SessionAuthority['subscribe']>;
  };
  listeners: Set<() => void>;
  emit: () => void;
  request: RequestAuthority;
  scope: { authority: RequestAuthority; onDispatch: Mock };
  retire: () => void;
}

export function passkeyFixture(): PasskeyFixture {
  const listeners = new Set<() => void>();
  const key = {
    id: 'pk_1',
    name: 'MacBook' as string | null,
    createdAt: new Date('2026-09-01'),
    lastUsedAt: null as Date | null,
    update: vi.fn(async (_: { name: string }): Promise<unknown> => undefined),
    delete: vi.fn(async (): Promise<void> => undefined),
  };
  const user = {
    id: 'user-1',
    passkeys: [key],
    createPasskey: vi.fn(async (): Promise<void> => undefined),
    reload: vi.fn(async (): Promise<{ id: string }> => ({ id: 'user-1' })),
  };
  const session = { id: 'session-1', user, getToken: vi.fn(async () => 'token') };
  const clerk = {
    loaded: true,
    user,
    session,
    signOut: vi.fn<() => void>(),
    addListener: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const emit = () => {
    for (const listener of [...listeners]) listener();
  };
  let active = true;
  const authority: SessionAuthority = {
    userId: user.id,
    sessionId: session.id,
    isCurrent: () => active,
    getToken: session.getToken,
    subscribe: clerk.addListener,
  };
  bindNativeSession(authority, session as unknown as Parameters<typeof bindNativeSession>[1]);
  const request = createRequestAuthority(authority);
  return {
    key,
    user,
    session,
    clerk,
    listeners,
    emit,
    request,
    scope: { authority: request, onDispatch: vi.fn<() => void>() },
    retire: () => {
      active = false;
      emit();
    },
  };
}
