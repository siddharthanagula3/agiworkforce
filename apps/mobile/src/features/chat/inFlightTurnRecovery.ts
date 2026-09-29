import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { MANAGED_CLOUD_AGENT_RUNS_BASE_PATH } from '@agiworkforce/cloud-contracts';
import type { LifecycleStatus } from '@agiworkforce/types';
import { apiFetch } from '@/services/api';
import type { ChatMessage } from '@/types/chat';

export const IN_FLIGHT_TURN_RECHECK_MS = 5_000;
export const IN_FLIGHT_TURN_STALL_DEADLINE_MS = 150_000;
export const IN_FLIGHT_TURN_STALLED_MESSAGE =
  'This turn stopped running on the server and will not finish. Send it again to retry.';

export type InFlightTurnVerdict = Extract<LifecycleStatus, 'running' | 'idle'> | 'stalled';

export interface InFlightRunLiveness {
  state: string;
  staleForMs?: number;
}

const WAITING_STATES = new Set(['paused', 'awaiting_input', 'ready_for_review']);

export function shouldAskWhetherTurnIsRunning(input: {
  conversationId: string | null | undefined;
  isCloud: boolean;
  isStreaming: boolean;
  messages: readonly Pick<ChatMessage, 'role' | 'isStreaming'>[];
}): boolean {
  if (!input.conversationId || !input.isCloud || input.isStreaming) return false;
  const last = input.messages[input.messages.length - 1];
  if (!last || last.isStreaming) return false;
  return last.role === 'user';
}

function isAlive(run: InFlightRunLiveness, stallDeadlineMs: number): boolean {
  if (WAITING_STATES.has(run.state)) return true;
  if (typeof run.staleForMs !== 'number') return true;
  return run.staleForMs < stallDeadlineMs;
}

export function readInFlightTurnVerdict(
  runs: readonly InFlightRunLiveness[],
  stallDeadlineMs: number = IN_FLIGHT_TURN_STALL_DEADLINE_MS,
): InFlightTurnVerdict {
  if (runs.length === 0) return 'idle';
  return runs.some((run) => isAlive(run, stallDeadlineMs)) ? 'running' : 'stalled';
}

export async function askWhetherTurnIsRunning(
  conversationId: string,
  signal: AbortSignal,
): Promise<InFlightTurnVerdict> {
  const response = await apiFetch(
    `${MANAGED_CLOUD_AGENT_RUNS_BASE_PATH}?conversationId=${encodeURIComponent(conversationId)}`,
    { method: 'GET', signal },
  );
  if (!response.ok) return 'idle';
  const payload = (await response.json()) as { runs?: unknown[] };
  if (!Array.isArray(payload.runs)) return 'idle';
  const runs = payload.runs.filter(
    (run): run is InFlightRunLiveness =>
      typeof run === 'object' &&
      run !== null &&
      typeof (run as InFlightRunLiveness).state === 'string',
  );
  if (runs.length === 0) return payload.runs.length > 0 ? 'running' : 'idle';
  return readInFlightTurnVerdict(runs);
}

export function useInFlightTurnRecovery(input: {
  conversationId: string | null | undefined;
  isCloud: boolean;
  isStreaming: boolean;
  messages: readonly Pick<ChatMessage, 'role' | 'isStreaming'>[];
  onFinished: () => void;
}): InFlightTurnVerdict {
  const [verdict, setVerdict] = useState<InFlightTurnVerdict>('idle');
  const [foregroundTick, setForegroundTick] = useState(0);
  const onFinishedRef = useRef(input.onFinished);
  onFinishedRef.current = input.onFinished;
  const runningSeen = useRef<string | null>(null);
  const shouldAsk = shouldAskWhetherTurnIsRunning(input);
  const conversationId = input.conversationId;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setForegroundTick((tick) => tick + 1);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!shouldAsk || !conversationId) {
      setVerdict('idle');
      return undefined;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const ask = async (): Promise<void> => {
      let next: InFlightTurnVerdict;
      try {
        next = await askWhetherTurnIsRunning(conversationId, controller.signal);
      } catch {
        return;
      }
      if (controller.signal.aborted) return;
      setVerdict(next);
      if (next === 'running') {
        runningSeen.current = conversationId;
        timer = setTimeout(() => void ask(), IN_FLIGHT_TURN_RECHECK_MS);
        return;
      }
      const finished = runningSeen.current === conversationId && next === 'idle';
      runningSeen.current = null;
      if (finished) onFinishedRef.current();
    };

    void ask();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [conversationId, foregroundTick, shouldAsk]);

  return verdict;
}
