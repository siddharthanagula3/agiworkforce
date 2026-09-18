'use client';

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { StepUpDialog } from '@/features/auth/StepUpDialog';
import {
  fetchWithStepUp,
  type StepUpChallenge,
  type StepUpSend,
} from '@/features/auth/step-up-fetch';

interface PendingChallenge {
  challenge: StepUpChallenge;
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

  const close = useCallback((token: string | null) => {
    pendingRef.current?.settle(token);
    pendingRef.current = null;
    setPending(null);
  }, []);

  // An unmount mid-challenge would otherwise leave the caller awaiting forever.
  useEffect(
    () => () => {
      pendingRef.current?.settle(null);
      pendingRef.current = null;
    },
    [],
  );

  const withStepUp = useCallback(
    (send: StepUpSend, resourceId: string | null = null): Promise<Response> =>
      fetchWithStepUp(
        send,
        (challenge) =>
          new Promise<string | null>((resolve) => {
            pendingRef.current?.settle(null);
            const next: PendingChallenge = { challenge, settle: resolve };
            pendingRef.current = next;
            setPending(next);
          }),
        resourceId,
      ),
    [],
  );

  const dialog = pending ? (
    <StepUpDialog
      open
      action={pending.challenge.action}
      consequence={pending.challenge.consequence}
      resourceId={pending.challenge.resourceId}
      onCancel={() => close(null)}
      onSatisfied={(token) => close(token)}
    />
  ) : null;

  return { withStepUp, dialog };
}
