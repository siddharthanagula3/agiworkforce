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
export const IN_FLIGHT_TURN_WAITING_MESSAGE =
  'Waiting for the answer. It appears here when it is ready.';

export type InFlightTurnVerdict =
  Extract<LifecycleStatus, 'running' | 'idle'> | 'stalled' | 'checking' | 'unknown' | 'waiting';

export interface InFlightRunLiveness {
  state: string;
  staleForMs?: number;
}

type TurnRow = Pick<ChatMessage, 'role'> &
  Partial<
    Pick<
      ChatMessage,
      | 'id'
      | 'createdAt'
      | 'isStreaming'
      | 'isQueued'
      | 'queueFailed'
      | 'metadata'
      | 'toolCalls'
      | 'content'
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
  if (input.verdict === 'unknown' || input.verdict === 'waiting') return 'unknown';
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

/**
 * A turn started on another device may be a plain answer that leaves no run to
 * find, so a recent question with no run is waited on rather than called
 * stopped, which would invite a second paid answer. The wait is bounded from
 * the earlier of when it was sent and when this phone first asked, so a clock
 * ahead of this phone's cannot hold it open.
 */
function questionMayStillBeAnswered(
  sentAt: string | undefined,
  firstAskedAtMs: number,
  nowMs: number,
): boolean {
  const sentAtMs = Date.parse(sentAt ?? '');
  if (!Number.isFinite(sentAtMs)) return false;
  return nowMs - Math.min(sentAtMs, firstAskedAtMs) < IN_FLIGHT_TURN_STALL_DEADLINE_MS;
}

interface TurnVerdictState {
  turn: string | null;
  verdict: InFlightTurnVerdict;
}

const NO_TURN: TurnVerdictState = { turn: null, verdict: 'idle' };

export function useInFlightTurnRecovery(
  input: InFlightTurnInput & { isOnline: boolean; onFinished: () => void },
): InFlightTurnVerdict {
  const [answer, setAnswer] = useState<TurnVerdictState>(NO_TURN);
  const [recheckTick, setRecheckTick] = useState(0);
  const wasOnline = useRef(input.isOnline);
  const onFinishedRef = useRef(input.onFinished);
  onFinishedRef.current = input.onFinished;
  const runningSeen = useRef<string | null>(null);
  const firstAsked = useRef<{ turn: string; atMs: number } | null>(null);
  const asking = turnToAsk(input);
  const conversationId = input.conversationId;
  const last = input.messages[input.messages.length - 1];
  const turn = asking && conversationId ? `${conversationId}:${asking}:${last?.id ?? ''}` : null;
  const questionSentAt = asking === 'question' ? last?.createdAt : undefined;

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
    if (!turn || !conversationId) {
      setAnswer(NO_TURN);
      return undefined;
    }
    const firstAskedAtMs = firstAsked.current?.turn === turn ? firstAsked.current.atMs : Date.now();
    firstAsked.current = { turn, atMs: firstAskedAtMs };
    const settle = (verdict: InFlightTurnVerdict): void => setAnswer({ turn, verdict });
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
        settle(next);
        runningSeen.current = conversationId;
        askAgainLater();
        return;
      }
      if (next === 'unknown') {
        settle(next);
        if (runningSeen.current === conversationId) askAgainLater();
        return;
      }
      const finished = runningSeen.current === conversationId && next === 'idle';
      runningSeen.current = null;
      if (finished) {
        onFinishedRef.current();
        settle('checking');
        askAgainLater();
        return;
      }
      if (
        next === 'idle' &&
        asking === 'question' &&
        questionMayStillBeAnswered(questionSentAt, firstAskedAtMs, Date.now())
      ) {
        settle('waiting');
        askAgainLater();
        return;
      }
      settle('stalled');
    };

    void ask();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [asking, conversationId, questionSentAt, recheckTick, turn]);

  if (turn === null) return 'idle';
  return answer.turn === turn ? answer.verdict : 'checking';
}
