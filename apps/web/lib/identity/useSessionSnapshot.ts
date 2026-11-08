'use client';

import { useProviderAuth as useAuth, useProviderClerk as useClerk } from './client';
import { useCallback, useRef } from 'react';
import type { SessionAuthority } from './request-authority';
import { bindNativeSession } from './native-session-authority';

export type IdentitySessionSnapshot = SessionAuthority;

function useIdentityObservation() {
  const clerk = useClerk();
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  const current = useRef({ clerk, isLoaded, isSignedIn, userId, sessionId });
  const generation = useRef(0);
  const renderedIdentity = `${isLoaded}:${isSignedIn}:${userId}:${sessionId}`;
  const observed = useRef({
    clerk,
    loaded: clerk.loaded,
    session: clerk.session,
    sessionId: clerk.session?.id,
    sessionUserId: clerk.session?.user?.id,
    userId: clerk.user?.id,
    renderedIdentity,
  });
  const observe = useCallback(() => {
    const sdk = current.current.clerk;
    const previous = observed.current;
    const rendered = current.current;
    const identity = `${rendered.isLoaded}:${rendered.isSignedIn}:${rendered.userId}:${rendered.sessionId}`;
    if (
      previous.clerk !== sdk ||
      previous.loaded !== sdk.loaded ||
      previous.session !== sdk.session ||
      previous.sessionId !== sdk.session?.id ||
      previous.sessionUserId !== sdk.session?.user?.id ||
      previous.userId !== sdk.user?.id ||
      previous.renderedIdentity !== identity
    ) {
      generation.current += 1;
      observed.current = {
        clerk: sdk,
        loaded: sdk.loaded,
        session: sdk.session,
        sessionId: sdk.session?.id,
        sessionUserId: sdk.session?.user?.id,
        userId: sdk.user?.id,
        renderedIdentity: identity,
      };
    }
  }, []);
  current.current = { clerk, isLoaded, isSignedIn, userId, sessionId };
  observe();
  return { current, generation, observe };
}

export function useReadonlyIdentityLifetime(): () => { isCurrent: () => boolean } {
  const { generation, observe } = useIdentityObservation();
  return useCallback(() => {
    observe();
    const capturedGeneration = generation.current;
    let retired = false;
    return {
      isCurrent: () => {
        observe();
        if (generation.current !== capturedGeneration) retired = true;
        return !retired;
      },
    };
  }, [generation, observe]);
}

export function useSessionSnapshot(): () => IdentitySessionSnapshot | null {
  const { current, generation, observe } = useIdentityObservation();
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
        capturedGeneration === generation.current &&
        ownerId &&
        incarnation &&
        session &&
        latest.clerk === sdk &&
        latest.isLoaded &&
        latest.isSignedIn === true &&
        latest.userId === ownerId &&
        latest.sessionId === incarnation &&
        sdk.loaded &&
        sdk.session === session &&
        session.id === incarnation &&
        sdk.user?.id === ownerId &&
        session.user?.id === ownerId,
      );
      if (!matches) retired = true;
      return !retired;
    };
    if (!isCurrent() || !ownerId || !incarnation || !session) return null;
    const snapshot: SessionAuthority = {
      userId: ownerId,
      sessionId: incarnation,
      isCurrent,
      subscribe: (listener) => sdk.addListener(() => listener()),
      getToken: async (options) => {
        if (!isCurrent()) return null;
        const token = await (options === undefined
          ? session.getToken()
          : session.getToken(options));
        return isCurrent() ? token : null;
      },
    };
    bindNativeSession(snapshot, session);
    return snapshot;
  }, [current, generation, observe]);
}
