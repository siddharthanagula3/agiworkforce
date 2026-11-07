import type { useClerk } from '@clerk/nextjs';
import type { SessionAuthority } from './request-authority';

type NativeSession = NonNullable<ReturnType<typeof useClerk>['session']>;
const nativeSessions = new WeakMap<SessionAuthority, NativeSession>();

export function bindNativeSession(authority: SessionAuthority, session: NativeSession): void {
  nativeSessions.set(authority, session);
}

export function nativeSessionFor(authority: SessionAuthority): NativeSession {
  const session = nativeSessions.get(authority);
  if (!authority.isCurrent() || !session) {
    throw new DOMException('Session owner changed', 'AbortError');
  }
  return session;
}
