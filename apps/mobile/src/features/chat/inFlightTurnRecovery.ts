import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { MANAGED_CLOUD_AGENT_RUNS_BASE_PATH } from '@agiworkforce/cloud-contracts';
import type { LifecycleStatus } from '@agiworkforce/types';
import { apiFetch } from '@/services/api';
import type { ChatMessage } from '@/types/chat';
import { hasUnfinishedRun, isStoppedFinishReason, type LiveRunState } from './utils/agentActivity';

export const IN_FLIGHT_TURN_RECHECK_MS = 5_000;
export const IN_FLIGHT_TURN_STALL_DEADLINE_MS = 150_000;
export const IN_FLIGHT_TURN_STALLED_MESSAGE =
  'This turn stopped running on the server and will not finish. Send it again to retry.';

export type InFlightTurnVerdict =
  Extract<LifecycleStatus, 'running' | 'idle'> | 'stalled' | 'checking' | 'unknown';

export interface InFlightRunLiveness {
  state: string;
  staleForMs?: number;
}

type TurnRow = Pick<ChatMessage, 'role'> &
  Partial<
    Pick<
      ChatMessage,
      'isStreaming' | 'isQueued' | 'queueFailed' | 'metadata' | 'toolCalls' | 'content'
    >
  >;

function questionSettledOnThisPhone(question: TurnRow): boolean {
  return (
    question.isQueued === true ||
    question.queueFailed === true ||
    isStoppedFinishReason(question.metadata?.['finishReason'])
  );
}

interface InFlightTurnInput {
  conversationId: string | null | undefined;
  isCloud: boolean;
  isStreaming: boolean;
  messages: readonly TurnRow[];
}

const WAITING_STATES = new Set(['paused', 'awaiting_input', 'ready_for_review']);

function turnToAsk(input: InFlightTurnInput): 'question' | 'answer' | null {
  if (!input.conversationId || !input.isCloud || input.isStreaming) return null;
  const last = input.messages[input.messages.length - 1];
  if (!last || last.isStreaming) return null;
  if (last.role === 'user') return questionSettledOnThisPhone(last) ? null : 'question';
  return hasUnfinishedRun(last) ? 'answer' : null;
}

export function shouldAskWhetherTurnIsRunning(input: InFlightTurnInput): boolean {
  return turnToAsk(input) !== null;
}

export function lastAnswerLiveRun(input: {
  isCloud: boolean;
  isStreaming: boolean;
  verdict: InFlightTurnVerdict;
}): LiveRunState | undefined {
  if (input.isStreaming) return undefined;
  if (!input.isCloud) return 'ended';
  if (input.verdict === 'running') return 'live';
  if (input.verdict === 'stalled') return 'ended';
  if (input.verdict === 'unknown') return 'unknown';
  return undefined;
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
  if (!response.ok) return 'unknown';
  const payload = (await response.json()) as { runs?: unknown[] };
  if (!Array.isArray(payload.runs)) return 'unknown';
  const runs = payload.runs.filter(
    (run): run is InFlightRunLiveness =>
      typeof run === 'object' &&
      run !== null &&
      typeof (run as InFlightRunLiveness).state === 'string',
  );
  if (runs.length === 0) return payload.runs.length > 0 ? 'running' : 'idle';
  return readInFlightTurnVerdict(runs);
}

export function useInFlightTurnRecovery(
  input: InFlightTurnInput & { isOnline: boolean; onFinished: () => void },
): InFlightTurnVerdict {
  const [verdict, setVerdict] = useState<InFlightTurnVerdict>('idle');
  const [recheckTick, setRecheckTick] = useState(0);
  const wasOnline = useRef(input.isOnline);
  const onFinishedRef = useRef(input.onFinished);
  onFinishedRef.current = input.onFinished;
  const runningSeen = useRef<string | null>(null);
  const askedFor = useRef<string | null>(null);
  const asking = turnToAsk(input);
  const conversationId = input.conversationId;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setRecheckTick((tick) => tick + 1);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (input.isOnline && !wasOnline.current) setRecheckTick((tick) => tick + 1);
    wasOnline.current = input.isOnline;
  }, [input.isOnline]);

  useEffect(() => {
    if (!asking || !conversationId) {
      askedFor.current = null;
      setVerdict('idle');
      return undefined;
    }
    const turn = `${conversationId}:${asking}`;
    if (askedFor.current !== turn) {
      askedFor.current = turn;
      setVerdict('checking');
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const askAgainLater = (): void => {
      timer = setTimeout(() => void ask(), IN_FLIGHT_TURN_RECHECK_MS);
    };

    const ask = async (): Promise<void> => {
      let next: InFlightTurnVerdict;
      try {
        next = await askWhetherTurnIsRunning(conversationId, controller.signal);
      } catch {
        next = 'unknown';
      }
      if (controller.signal.aborted) return;
      if (next === 'running') {
        setVerdict(next);
        runningSeen.current = conversationId;
        askAgainLater();
        return;
      }
      if (next === 'unknown') {
        setVerdict(next);
        if (runningSeen.current === conversationId) askAgainLater();
        return;
      }
      const finished = runningSeen.current === conversationId && next === 'idle';
      runningSeen.current = null;
      if (finished) {
        onFinishedRef.current();
        setVerdict('checking');
        askAgainLater();
        return;
      }
      setVerdict('stalled');
    };

    void ask();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [asking, conversationId, recheckTick]);

  return verdict;
}
