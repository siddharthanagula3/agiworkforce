'use client';

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { StepUpDialog } from '@/features/auth/StepUpDialog';
import {
  fetchWithStepUp,
  requestStepUpGrant,
  StepUpCancelledError,
  type StepUpChallenge,
  type StepUpSend,
} from '@/features/auth/step-up-fetch';
import type { StepUpLevel } from '@/lib/server/step-up/actions';

interface StepUpLifetime {
  active: boolean;
}

interface PendingChallenge {
  id: number;
  lifetime: StepUpLifetime;
  challenge: StepUpChallenge;
  level: StepUpLevel | null;
  settle: (token: string | null) => void;
}

export interface UseStepUp {
  /** Runs `send`, and on a STEP_UP_REQUIRED refusal replays it once with a fresh proof. */
  withStepUp: (send: StepUpSend, resourceId?: string | null) => Promise<Response>;
  /** Render this next to the control; the challenge has no other way to reach the page. */
  dialog: ReactElement | null;
}

export function useStepUp(): UseStepUp {
  const [pending, setPending] = useState<PendingChallenge | null>(null);
  const pendingRef = useRef<PendingChallenge | null>(null);
  const nextChallengeId = useRef(0);
  const lifetimeRef = useRef<StepUpLifetime>({ active: true });

  const close = useCallback((expected: PendingChallenge, token: string | null) => {
    if (!expected.lifetime.active || pendingRef.current !== expected) return;
    pendingRef.current = null;
    setPending(null);
    expected.settle(token);
  }, []);

  useEffect(() => {
    if (!lifetimeRef.current.active) {
      lifetimeRef.current = { active: true };
      setPending(null);
    }
    const lifetime = lifetimeRef.current;
    return () => {
      lifetime.active = false;
      const current = pendingRef.current;
      if (current?.lifetime === lifetime) {
        pendingRef.current = null;
        current.settle(null);
      }
    };
  }, []);

  const withStepUp = useCallback(
    (send: StepUpSend, resourceId: string | null = null): Promise<Response> => {
      // Re-setup admits new calls, but never revives an earlier invocation.
      const lifetime = lifetimeRef.current;
      const assertActive = () => {
        if (!lifetime.active) throw new StepUpCancelledError();
      };
      return fetchWithStepUp(
        (headers) => {
          assertActive();
          // The sender owns dispatch after invocation, including any auth awaits.
          return send(headers);
        },
        async (challenge) => {
          assertActive();
          const silent = await requestStepUpGrant(challenge.action, challenge.resourceId);
          assertActive();
          if (silent.kind === 'granted') return silent.token;
          return new Promise<string | null>((resolve) => {
            pendingRef.current?.settle(null);
            const next: PendingChallenge = {
              id: ++nextChallengeId.current,
              lifetime,
              challenge,
              level: silent.kind === 'verify' ? silent.level : null,
              settle: resolve,
            };
            pendingRef.current = next;
            setPending(next);
          });
        },
        resourceId,
      );
    },
    [],
  );

  const dialog = pending ? (
    <StepUpDialog
      key={pending.id}
      open
      action={pending.challenge.action}
      consequence={pending.challenge.consequence}
      resourceId={pending.challenge.resourceId}
      level={pending.level}
      onCancel={() => close(pending, null)}
      onSatisfied={(token) => close(pending, token)}
    />
  ) : null;

  return { withStepUp, dialog };
}
