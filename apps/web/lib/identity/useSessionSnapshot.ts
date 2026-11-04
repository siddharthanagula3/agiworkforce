'use client';

import { useAuth, useClerk } from '@clerk/nextjs';
import { useCallback, useRef } from 'react';
import type { SessionAuthority } from './request-authority';

export type IdentitySessionSnapshot = SessionAuthority;

export function useSessionSnapshot(): () => IdentitySessionSnapshot | null {
  const clerk = useClerk();
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  const current = useRef({ clerk, isLoaded, isSignedIn, userId, sessionId });
  const generation = useRef(0);
  const renderedIdentity = `${isLoaded}:${isSignedIn}:${userId}:${sessionId}`;
  const observed = useRef({ clerk, session: clerk.session, userId: clerk.user?.id, renderedIdentity });
  const observe = useCallback(() => {
    const sdk = current.current.clerk;
    const previous = observed.current;
    const rendered = current.current;
    const identity = `${rendered.isLoaded}:${rendered.isSignedIn}:${rendered.userId}:${rendered.sessionId}`;
    if (previous.clerk !== sdk || previous.session !== sdk.session || previous.userId !== sdk.user?.id || previous.renderedIdentity !== identity) {
      generation.current += 1;
      observed.current = { clerk: sdk, session: sdk.session, userId: sdk.user?.id, renderedIdentity: identity };
    }
  }, []);
  current.current = { clerk, isLoaded, isSignedIn, userId, sessionId };
  observe();

  return useCallback(() => {
    const rendered = current.current;
    const sdk = rendered.clerk;
    const session = sdk.session;
    const ownerId = rendered.userId;
    const incarnation = rendered.sessionId;
    const capturedGeneration = generation.current;
    let retired = false;
    const isCurrent = () => {
      observe();
      const latest = current.current;
      const matches = Boolean(
        capturedGeneration === generation.current && ownerId && incarnation && session &&
        latest.clerk === sdk && latest.isLoaded && latest.isSignedIn === true &&
        latest.userId === ownerId && latest.sessionId === incarnation &&
        sdk.loaded && sdk.session === session && session.id === incarnation &&
        sdk.user?.id === ownerId && session.user?.id === ownerId,
      );
      if (!matches) retired = true;
      return !retired;
    };
    return isCurrent() && ownerId && incarnation
      ? {
          userId: ownerId,
          sessionId: incarnation,
          isCurrent,
          getToken: async () => {
            if (!isCurrent()) return null;
            const token = await session!.getToken();
            return isCurrent() ? token : null;
          },
        }
      : null;
  }, [observe]);
}
