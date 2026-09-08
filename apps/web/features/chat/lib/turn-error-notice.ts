import type { ChatMessage } from '@agiworkforce/unified-chat';
import { hasStreamError, hasVisibleContent, isMessageContinuable } from './continue-generation';

/**
 * A safety refusal: the provider's safety layer stopped the response.
 * Reaches this surface as `metadata.finishReason` 'refusal' (the canonical
 * StreamChunkStop member, emitted on the legacy web wire as the literal
 * reason) or 'content_filter' (the OpenAI wire vocabulary on the
 * passthrough path). Distinct from streamError (transport/provider failure)
 * and from continuable truncation, it gets its own honest notice, never a
 * generic error and never a silent stop.
 */
export function isRefusalFinish(message: ChatMessage | undefined | null): boolean {
  const reason = (message?.metadata as { finishReason?: unknown } | undefined)?.finishReason;
  return reason === 'refusal' || reason === 'content_filter';
}

/**
 * A user-initiated Stop, not a model or transport failure. Distinct from
 * isIncompleteTurn/hasStreamError so it never borrows their failure wording
 * or styling, see abandonTurn/handleStreamError in useChatStream.ts, which
 * stamp `finishReason: 'stopped'` on abort.
 */
export function isStoppedTurn(message: ChatMessage | undefined | null): boolean {
  if (!message || message.role !== 'assistant' || message.isStreaming) return false;
  const reason = (message.metadata as { finishReason?: unknown } | undefined)?.finishReason;
  return reason === 'stopped';
}

/**
 * A turn that never produced a usable assistant reply: either the user's
 * message is trailing with no assistant row after it (a managed-cloud turn
 * dropped before any row was persisted), or the assistant row exists but is
 * marked truncated/error by the server marker or a web-composer error row.
 * Distinct from streamError (additive mid-stream failure with partial content)
 * and refusal, it gets an explicit "didn't complete" affordance with Retry.
 */
export function isIncompleteTurn(message: ChatMessage | undefined | null): boolean {
  if (!message) return false;
  if (message.role === 'user') return true;
  if (message.role !== 'assistant') return false;
  if (message.error) return true;
  return (message.metadata as { truncated?: unknown } | undefined)?.truncated === true;
}

export type IncompleteTurnCause =
  | 'rateLimit'
  | 'providerOutage'
  | 'timeout'
  | 'modelRestriction'
  | 'emptyResponse';

export const INCOMPLETE_TURN_CAUSE_BY_ERROR_CODE: Readonly<Record<string, IncompleteTurnCause>> = {
  provider_rate_limited: 'rateLimit',
  provider_quota_exhausted: 'rateLimit',
  provider_overloaded: 'providerOutage',
  provider_unreachable: 'providerOutage',
  provider_error: 'providerOutage',
  provider_billing_exhausted: 'providerOutage',
  provider_credentials_rejected: 'providerOutage',
  provider_paused_turn: 'providerOutage',
  provider_timeout: 'timeout',
  model_not_found: 'modelRestriction',
  context_length_exceeded: 'modelRestriction',
  attachment_too_large: 'modelRestriction',
  tool_call_invalid: 'modelRestriction',
};

const INCOMPLETE_TURN_MESSAGE_BY_CAUSE: Readonly<Record<IncompleteTurnCause, string>> = {
  rateLimit:
    'This model is receiving too many requests right now. Wait a moment and retry, or choose Auto to use another available model.',
  providerOutage:
    'The model provider is temporarily unreachable. Retry, or choose Auto to use another available model.',
  timeout:
    'The model took too long to respond. Retry, or pick a faster model from the model picker.',
  modelRestriction:
    'The selected model could not complete this request. Retry, or choose a different model.',
  emptyResponse: 'The model returned no response for this turn. Retry, or rephrase your message.',
};

export const INCOMPLETE_TURN_DEFAULT_MESSAGE =
  "This turn didn't complete. No response was received.";

export function incompleteTurnNoticeMessage(message: ChatMessage | undefined | null): string {
  if (message?.role === 'user') return INCOMPLETE_TURN_MESSAGE_BY_CAUSE.emptyResponse;

  const errorCode = (message?.metadata as { errorCode?: unknown } | undefined)?.errorCode;
  const cause =
    typeof errorCode === 'string' ? INCOMPLETE_TURN_CAUSE_BY_ERROR_CODE[errorCode] : undefined;
  if (cause) return INCOMPLETE_TURN_MESSAGE_BY_CAUSE[cause];

  const truncated = (message?.metadata as { truncated?: unknown } | undefined)?.truncated === true;
  if (truncated && !hasVisibleContent(message?.content)) {
    return INCOMPLETE_TURN_MESSAGE_BY_CAUSE.emptyResponse;
  }

  return INCOMPLETE_TURN_DEFAULT_MESSAGE;
}

export const INCOMPLETE_TURN_GRACE_MS = 45_000;

export function isWithinIncompleteTurnGracePeriod(
  message: ChatMessage | undefined | null,
  nowMs: number,
): boolean {
  if (!message || message.role !== 'user' || !message.createdAt) return false;
  const sentAtMs = new Date(message.createdAt).getTime();
  if (Number.isNaN(sentAtMs)) return false;
  return nowMs - sentAtMs < INCOMPLETE_TURN_GRACE_MS;
}

export interface TurnErrorNoticeInput {
  lastMessage: ChatMessage | undefined | null;
  isLoading: boolean;
  reportedTurnError: string | null;
  pastGracePeriod: boolean;
}

/**
 * The turn notices are mutually exclusive: Continue, a user Stop, a mid-stream
 * provider failure and a safety refusal each own the last message when they
 * apply, and this is the fallback that states an unusable turn. Resolving it
 * here rather than inside the transcript is what lets the notice render in the
 * composer column while the transcript keeps using the same answer to decide
 * whether the turn failed.
 */
export function resolveTurnErrorNotice({
  lastMessage,
  isLoading,
  reportedTurnError,
  pastGracePeriod,
}: TurnErrorNoticeInput): string | null {
  if (isLoading || lastMessage?.isStreaming) return null;
  if (isStoppedTurn(lastMessage)) return null;
  if (isMessageContinuable(lastMessage)) return null;
  if (hasStreamError(lastMessage)) return null;
  if (isRefusalFinish(lastMessage)) return null;
  if (reportedTurnError !== null) return reportedTurnError;
  if (!isIncompleteTurn(lastMessage)) return null;
  if (lastMessage?.role === 'user' && !pastGracePeriod) return null;
  return incompleteTurnNoticeMessage(lastMessage);
}
