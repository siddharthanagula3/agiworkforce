import { vi } from 'vitest';
import type { SessionAuthority } from '../request-authority';
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

export function passkeyFixture() {
  const listeners = new Set<() => void>();
  const key = {
    id: 'pk_1',
    name: 'MacBook' as string | null,
    createdAt: new Date('2026-09-01'),
    lastUsedAt: null as Date | null,
    update: vi.fn(async (_: { name: string }): Promise<unknown> => undefined),
    delete: vi.fn(async () => undefined),
  };
  const user = {
    id: 'user-1',
    passkeys: [key],
    createPasskey: vi.fn(async () => undefined),
    reload: vi.fn(async (): Promise<{ id: string }> => ({ id: 'user-1' })),
  };
  const session = { id: 'session-1', user, getToken: vi.fn(async () => 'token') };
  const clerk = {
    loaded: true,
    user,
    session,
    signOut: vi.fn(),
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
    scope: { authority: request, onDispatch: vi.fn() },
    retire: () => {
      active = false;
      emit();
    },
  };
}
