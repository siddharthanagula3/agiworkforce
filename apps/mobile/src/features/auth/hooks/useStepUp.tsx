import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react';
import { useSession } from '@clerk/expo';
import { StepUpModal } from '../components/StepUpModal';
import { subscribeCloudAccountEpochChange } from '../services/cloudAccountSession';
import {
  STEP_UP_TOKEN_HEADER,
  StepUpCancelledError,
  captureStepUpIdentity,
  currentSessionToken,
  isStepUpRequired,
  readStepUpConsequence,
  requestStepUpGrant,
  type StepUpAction,
  type StepUpChallenge,
  type StepUpIdentity,
} from '../services/stepUp';

export type StepUpHeaders = Record<string, string>;

export interface UseStepUp {
  withStepUp: <T>(
    action: StepUpAction,
    resourceId: string | null,
    send: (headers: StepUpHeaders) => Promise<T>,
  ) => Promise<T>;
  modal: ReactElement | null;
}

interface Attempt {
  readonly id: number;
  readonly action: StepUpAction;
  readonly resourceId: string | null;
  readonly identity: StepUpIdentity;
  readonly controller: AbortController;
  settle: ((token: string | null) => void) | null;
}

export function useStepUp(): UseStepUp {
  const dialogOwnerId = useId();
  const { session } = useSession();
  const [challenge, setChallenge] = useState<StepUpChallenge | null>(null);
  const active = useRef<Attempt | null>(null);
  const sequence = useRef(0);
  const mounted = useRef(true);

  const current = useCallback(
    (attempt: Attempt) =>
      mounted.current &&
      active.current === attempt &&
      !attempt.controller.signal.aborted &&
      attempt.identity.isCurrent(),
    [],
  );

  const settle = useCallback((attempt: Attempt, token: string | null) => {
    if (active.current !== attempt) return;
    const resolve = attempt.settle;
    attempt.settle = null;
    if (mounted.current) setChallenge((value) => (value?.attemptId === attempt.id ? null : value));
    resolve?.(token);
  }, []);

  const retire = useCallback(
    (attempt: Attempt) => {
      attempt.controller.abort();
      settle(attempt, null);
      if (active.current === attempt) active.current = null;
    },
    [settle],
  );

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribeCloudAccountEpochChange(() => {
      const attempt = active.current;
      if (attempt && !current(attempt)) retire(attempt);
    });
    return () => {
      mounted.current = false;
      unsubscribe();
      if (active.current) retire(active.current);
    };
  }, [current, retire]);

  useEffect(() => {
    const attempt = active.current;
    if (attempt && !current(attempt)) retire(attempt);
  }, [session, current, retire]);

  const withStepUp = useCallback(
    async <T,>(
      action: StepUpAction,
      resourceId: string | null,
      send: (headers: StepUpHeaders) => Promise<T>,
    ): Promise<T> => {
      if (!mounted.current) throw new StepUpCancelledError();
      const identity = captureStepUpIdentity();
      if (active.current) retire(active.current);
      const attempt: Attempt = {
        id: ++sequence.current,
        action,
        resourceId,
        identity,
        controller: new AbortController(),
        settle: null,
      };
      active.current = attempt;
      const assertCurrent = () => {
        if (!current(attempt)) throw new StepUpCancelledError();
      };
      try {
        assertCurrent();
        try {
          return await send({});
        } catch (error) {
          if (!isStepUpRequired(error)) throw error;
        }
        assertCurrent();
        const pending = new Promise<string | null>((resolve) => {
          attempt.settle = resolve;
        });
        const options = { accountEpoch: identity.account, signal: attempt.controller.signal };
        const acquisition: { failure: { error: unknown } | null } = { failure: null };
        void (async () => {
          try {
            const sessionToken = await currentSessionToken(identity);
            assertCurrent();
            if (!sessionToken) throw new Error('You are signed out. Sign in again to continue.');
            const silent = await requestStepUpGrant(action, resourceId, sessionToken, options);
            assertCurrent();
            if (silent.kind === 'granted') {
              settle(attempt, silent.token);
              return;
            }
            if (silent.kind === 'failed') throw new Error(silent.message);
            const consequence = await readStepUpConsequence(action, options);
            assertCurrent();
            setChallenge({
              attemptId: attempt.id,
              action,
              resourceId,
              identity,
              consequence,
              level: silent.level,
              signal: attempt.controller.signal,
              isCurrent: () => current(attempt),
            });
          } catch (error) {
            if (!current(attempt)) {
              retire(attempt);
              return;
            }
            acquisition.failure = { error };
            settle(attempt, null);
          }
        })();
        const token = await pending;
        assertCurrent();
        if (acquisition.failure) throw acquisition.failure.error;
        if (!token) throw new StepUpCancelledError();
        return await send({ [STEP_UP_TOKEN_HEADER]: token });
      } finally {
        if (active.current === attempt) retire(attempt);
      }
    },
    [current, retire, settle],
  );

  const modal =
    challenge && challenge.isCurrent() ? (
      <StepUpModal
        key={`${dialogOwnerId}:${challenge.attemptId}`}
        challenge={challenge}
        onCancel={() => {
          const attempt = active.current;
          if (attempt?.id === challenge.attemptId) retire(attempt);
        }}
        onSatisfied={(token) => {
          const attempt = active.current;
          if (attempt?.id === challenge.attemptId && current(attempt)) settle(attempt, token);
        }}
      />
    ) : null;

  return { withStepUp, modal };
}
