import type { NativeIdentitySession } from './client';
import type { SessionAuthority } from './request-authority';

type NativeSession = NativeIdentitySession;
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
