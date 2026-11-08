import type { SessionAuthority } from './request-authority';

const nativeSessions = new WeakMap<SessionAuthority, object>();

export function bindNativeSession(authority: SessionAuthority, session: object): void {
  nativeSessions.set(authority, session);
}

export function nativeSessionFor<T extends object>(authority: SessionAuthority): T {
  const session = nativeSessions.get(authority);
  if (!authority.isCurrent() || !session) {
    throw new DOMException('Session owner changed', 'AbortError');
  }
  return session as T;
}
