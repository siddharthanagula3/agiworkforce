import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { StepUpModal } from '../components/StepUpModal';
import {
  STEP_UP_TOKEN_HEADER,
  StepUpCancelledError,
  currentSessionToken,
  isStepUpRequired,
  readStepUpConsequence,
  requestStepUpGrant,
  type StepUpAction,
  type StepUpChallenge,
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

export function useStepUp(): UseStepUp {
  const [challenge, setChallenge] = useState<StepUpChallenge | null>(null);
  const settleRef = useRef<((token: string | null) => void) | null>(null);

  const close = useCallback((token: string | null) => {
    settleRef.current?.(token);
    settleRef.current = null;
    setChallenge(null);
  }, []);

  useEffect(
    () => () => {
      settleRef.current?.(null);
      settleRef.current = null;
    },
    [],
  );

  const obtainGrant = useCallback(
    async (action: StepUpAction, resourceId: string | null): Promise<string | null> => {
      const sessionToken = await currentSessionToken();
      if (!sessionToken) throw new Error('You are signed out. Sign in again to continue.');
      const silent = await requestStepUpGrant(action, resourceId, sessionToken);
      if (silent.kind === 'granted') return silent.token;
      if (silent.kind === 'failed') throw new Error(silent.message);
      const consequence = await readStepUpConsequence(action);
      return new Promise<string | null>((resolve) => {
        settleRef.current?.(null);
        settleRef.current = resolve;
        setChallenge({ action, resourceId, consequence, level: silent.level });
      });
    },
    [],
  );

  const withStepUp = useCallback(
    async <T,>(
      action: StepUpAction,
      resourceId: string | null,
      send: (headers: StepUpHeaders) => Promise<T>,
    ): Promise<T> => {
      try {
        return await send({});
      } catch (error) {
        if (!isStepUpRequired(error)) throw error;
      }
      const token = await obtainGrant(action, resourceId);
      if (!token) throw new StepUpCancelledError();
      return send({ [STEP_UP_TOKEN_HEADER]: token });
    },
    [obtainGrant],
  );

  const modal = challenge ? (
    <StepUpModal
      challenge={challenge}
      onCancel={() => close(null)}
      onSatisfied={(token) => close(token)}
    />
  ) : null;

  return { withStepUp, modal };
}
