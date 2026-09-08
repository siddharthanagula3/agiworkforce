import type { Message } from '@shared/stores/web-chat-store';

export const IN_FLIGHT_TURN_RECHECK_MS = 5_000;

const RUNS_PATH = '/api/llm/v1/chat/completions/runs';

export interface InFlightTurnQuestion {
  conversationId: string | null;
  messages: readonly Message[];
  isLoading: boolean;
  isTemporaryConversation: boolean;
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

export async function askWhetherTurnIsRunning(
  conversationId: string,
  signal: AbortSignal,
): Promise<boolean> {
  const response = await fetch(
    `${RUNS_PATH}?conversationId=${encodeURIComponent(conversationId)}`,
    { signal },
  );
  if (!response.ok) return false;
  const payload = (await response.json()) as { runs?: unknown[] };
  return Array.isArray(payload.runs) && payload.runs.length > 0;
}
