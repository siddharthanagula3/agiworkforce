import type { Message } from '@shared/stores/web-chat-store';
import { DURABLE_STREAM_SILENCE_DEADLINE_MS } from '@/lib/deadline-policy';

export const IN_FLIGHT_TURN_RECHECK_MS = 5_000;

/**
 * How long an active run row may sit untouched before the client stops
 * believing it. The durable transport bounds its own silence at this deadline,
 * so a row quieter than that has no executor left to move it: the function
 * behind it died, and nothing but the reaper will ever end the row, at best at
 * the next quarter hour. Until this bound existed the conversation showed
 * "Generating response" with a Stop button for as long as the row survived.
 */
export const IN_FLIGHT_TURN_STALL_DEADLINE_MS = DURABLE_STREAM_SILENCE_DEADLINE_MS;

const RUNS_PATH = '/api/llm/v1/chat/completions/runs';

export interface InFlightTurnQuestion {
  conversationId: string | null;
  messages: readonly Message[];
  isLoading: boolean;
  isTemporaryConversation: boolean;
}

/**
 * `running`, a run is alive and the composer should stay in its loading state.
 * `stalled`, a row is still active but nothing has touched it inside the
 * silence deadline; the turn is gone and the user is owed an error and a retry.
 * `idle`, no active run, which is also what an unreadable answer degrades to.
 */
export type InFlightTurnVerdict = 'running' | 'stalled' | 'idle';

export interface InFlightRunLiveness {
  state: string;
  /**
   * Absent from a server older than the field. Unknown age is not zero age and
   * is not a stall; it reads as alive, which is how the client behaved before
   * the field existed.
   */
  staleForMs?: number | undefined;
}

export function shouldAskWhetherTurnIsRunning(question: InFlightTurnQuestion): boolean {
  if (!question.conversationId) return false;
  if (question.isTemporaryConversation) return false;
  if (question.isLoading) return false;
  const last = question.messages[question.messages.length - 1];
  if (!last) return false;
  if (last.isStreaming) return false;
  return last.role === 'user';
}

/**
 * A run paused on purpose is not stalled however long it waits: the user, or an
 * MCP server, owes it an answer and nothing is executing meanwhile.
 */
const WAITING_STATES = new Set(['paused', 'awaiting_input', 'ready_for_review']);

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
  const response = await fetch(
    `${RUNS_PATH}?conversationId=${encodeURIComponent(conversationId)}`,
    {
      signal,
    },
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
  // Rows this client cannot read at all are a contract mismatch, not an idle
  // conversation; keep waiting rather than invent an error the server never
  // reported.
  if (runs.length === 0) return payload.runs.length > 0 ? 'running' : 'idle';
  return readInFlightTurnVerdict(runs);
}
