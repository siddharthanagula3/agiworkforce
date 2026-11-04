'use client';

import { useAuth, useClerk } from '@clerk/nextjs';
import { useCallback, useRef } from 'react';

export interface IdentitySessionSnapshot {
  readonly userId: string;
  readonly sessionId: string;
  isCurrent: () => boolean;
}

export function useSessionSnapshot(): () => IdentitySessionSnapshot | null {
  const clerk = useClerk();
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  const current = useRef({ clerk, isLoaded, isSignedIn, userId, sessionId });
  current.current = { clerk, isLoaded, isSignedIn, userId, sessionId };

  return useCallback(() => {
    const rendered = current.current;
    const sdk = rendered.clerk;
    const session = sdk.session;
    const ownerId = rendered.userId;
    const incarnation = rendered.sessionId;
    const isCurrent = () => {
      const latest = current.current;
      return Boolean(
        ownerId && incarnation && session &&
        latest.clerk === sdk && latest.isLoaded && latest.isSignedIn === true &&
        latest.userId === ownerId && latest.sessionId === incarnation &&
        sdk.loaded && sdk.session === session && session.id === incarnation &&
        sdk.user?.id === ownerId && session.user?.id === ownerId,
      );
    };
    return isCurrent() && ownerId && incarnation
      ? { userId: ownerId, sessionId: incarnation, isCurrent }
      : null;
  }, []);
}
