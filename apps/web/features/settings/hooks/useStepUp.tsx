'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react';
import { StepUpDialog } from '@/features/auth/StepUpDialog';
import {
  fetchWithStepUp,
  requestStepUpGrant,
  StepUpCancelledError,
  type StepUpChallenge,
  type StepUpSend,
  type OwnedStepUpOptions,
} from '@/features/auth/step-up-fetch';
import { createRequestAuthority, type RequestAuthority } from '@/lib/identity/request-authority';
import type { StepUpLevel } from '@/lib/server/step-up/actions';

interface StepUpLifetime {
  active: boolean;
}

interface PendingChallenge {
  id: number;
  lifetime: StepUpLifetime;
  challenge: StepUpChallenge;
  level: StepUpLevel | null;
  authority?: RequestAuthority;
  settle: (token: string | null) => void;
}

export interface UseStepUp {
  /** Runs `send`, and on a STEP_UP_REQUIRED refusal replays it once with a fresh proof. */
  withStepUp: (
    send: StepUpSend,
    resourceId?: string | null,
    owned?: OwnedStepUpOptions,
  ) => Promise<Response>;
  /** Render this next to the control; the challenge has no other way to reach the page. */
  dialog: ReactElement | null;
}

export function useStepUp(): UseStepUp {
  const dialogOwnerId = useId();
  const [pending, setPending] = useState<PendingChallenge | null>(null);
  const pendingRef = useRef<PendingChallenge | null>(null);
  const nextChallengeId = useRef(0);
  const ownedRequests = useRef(new Set<RequestAuthority>());
  const lifetimeRef = useRef<StepUpLifetime>({ active: true });

  const close = useCallback((expected: PendingChallenge, token: string | null) => {
    if (!expected.lifetime.active || pendingRef.current !== expected) return;
    pendingRef.current = null;
    setPending(null);
    expected.settle(token);
    if (!token) expected.authority?.retire();
  }, []);

  useEffect(() => {
    if (!lifetimeRef.current.active) {
      lifetimeRef.current = { active: true };
      setPending(null);
    }
    const lifetime = lifetimeRef.current;
    const requests = ownedRequests.current;
    return () => {
      lifetime.active = false;
      for (const request of requests) request.retire();
      requests.clear();
      const current = pendingRef.current;
      if (current?.lifetime === lifetime) {
        pendingRef.current = null;
        current.authority?.retire();
        current.settle(null);
      }
    };
  }, []);

  const withStepUp = useCallback(
    (
      send: StepUpSend,
      resourceId: string | null = null,
      owned?: OwnedStepUpOptions,
    ): Promise<Response> => {
      const authority = owned
        ? createRequestAuthority(owned.authority.session, owned.authority.isCurrent)
        : undefined;
      if (authority) {
        for (const previous of ownedRequests.current) previous.retire();
        ownedRequests.current.add(authority);
      }
      const retire = () => authority?.retire();
      owned?.authority.signal.addEventListener('abort', retire, { once: true });
      let unsubscribe: (() => void) | undefined;
      const releaseObservation = () => {
        unsubscribe?.();
        unsubscribe = undefined;
      };
      const cancelPending = () => {
        releaseObservation();
        const current = pendingRef.current;
        if (current && authority && current.authority === authority) {
          pendingRef.current = null;
          current.settle(null);
          if (lifetimeRef.current.active) setPending(null);
        }
      };
      authority?.signal.addEventListener('abort', cancelPending, { once: true });
      unsubscribe = authority?.session.subscribe?.(() => {
        authority.isCurrent();
      });
      if (authority?.signal.aborted) releaseObservation();
      // Re-setup admits new calls, but never revives an earlier invocation.
      const lifetime = lifetimeRef.current;
      const assertActive = () => {
        if (!lifetime.active) throw new StepUpCancelledError();
        authority?.assertCurrent();
      };
      return fetchWithStepUp(
        (headers) => {
          assertActive();
          // The sender owns dispatch after invocation, including any auth awaits.
          return send(headers);
        },
        async (challenge) => {
          assertActive();
          const silent = await (authority
            ? requestStepUpGrant(challenge.action, challenge.resourceId, undefined, authority)
            : requestStepUpGrant(challenge.action, challenge.resourceId));
          assertActive();
          if (silent.kind === 'granted') return silent.token;
          return new Promise<string | null>((resolve) => {
            pendingRef.current?.authority?.retire();
            pendingRef.current?.settle(null);
            const next: PendingChallenge = {
              id: ++nextChallengeId.current,
              lifetime,
              authority,
              challenge,
              level: silent.kind === 'verify' ? silent.level : null,
              settle: resolve,
            };
            pendingRef.current = next;
            setPending(next);
          });
        },
        resourceId,
        authority ? { authority, onStepUpRequired: owned?.onStepUpRequired } : undefined,
      ).finally(() => {
        releaseObservation();
        owned?.authority.signal.removeEventListener('abort', retire);
        authority?.signal.removeEventListener('abort', cancelPending);
        authority?.retire();
        if (authority) ownedRequests.current.delete(authority);
      });
    },
    [],
  );

  const dialog = pending ? (
    <StepUpDialog
      key={`${dialogOwnerId}:${pending.id}`}
      open
      action={pending.challenge.action}
      consequence={pending.challenge.consequence}
      resourceId={pending.challenge.resourceId}
      level={pending.level}
      authority={pending.authority}
      onCancel={() => close(pending, null)}
      onSatisfied={(token) => close(pending, token)}
    />
  ) : null;

  return { withStepUp, dialog };
}
