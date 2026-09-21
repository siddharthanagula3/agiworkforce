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
  | 'contextLength'
  | 'outputLimit'
  | 'attachment'
  | 'toolCall'
  | 'contentFiltered'
  | 'planRestriction'
  | 'workspacePolicy'
  | 'sessionExpired'
  | 'accountLimit'
  | 'sharedFreeAllowance'
  | 'interrupted'
  | 'emptyResponse';

/**
 * One row per failure a turn can end on, because a reader who cannot tell an
 * attachment this model cannot read from a conversation that outgrew its
 * context window has no way to pick the move that fixes it. The codes are the
 * ones the gateway emits (`upstream-error-copy.ts`) plus the account-side
 * codes that reach a turn when no paywall slot claimed them first.
 */
export const INCOMPLETE_TURN_CAUSE_BY_ERROR_CODE: Readonly<Record<string, IncompleteTurnCause>> = {
  provider_rate_limited: 'rateLimit',
  provider_quota_exhausted: 'rateLimit',
  free_allowance_exhausted: 'sharedFreeAllowance',
  stream_interrupted: 'interrupted',
  provider_overloaded: 'providerOutage',
  provider_unreachable: 'providerOutage',
  provider_error: 'providerOutage',
  provider_billing_exhausted: 'providerOutage',
  provider_credentials_rejected: 'providerOutage',
  provider_paused_turn: 'providerOutage',
  provider_timeout: 'timeout',
  model_not_found: 'modelRestriction',
  model_not_available: 'planRestriction',
  context_length_exceeded: 'contextLength',
  max_output_tokens_exceeded: 'outputLimit',
  attachment_too_large: 'attachment',
  unsupported_attachment: 'attachment',
  tool_call_invalid: 'toolCall',
  content_filter: 'contentFiltered',
  content_blocked: 'contentFiltered',
  provider_rejected_request: 'modelRestriction',
  organization_policy: 'workspacePolicy',
  session_expired: 'sessionExpired',
  insufficient_credits: 'accountLimit',
  rolling_five_hour_limit_reached: 'accountLimit',
  rolling_weekly_limit_reached: 'accountLimit',
  flagship_weekly_limit_reached: 'accountLimit',
};

const INCOMPLETE_TURN_MESSAGE_BY_CAUSE: Readonly<Record<IncompleteTurnCause, string>> = {
  rateLimit:
    'This model is receiving too many requests right now. Wait a moment and retry, or switch to another model if your plan has one.',
  providerOutage:
    'The model provider is temporarily unreachable. Retry, or switch to another model if your plan has one.',
  timeout:
    'The model took too long to respond. Retry, or pick a faster model from the model picker.',
  modelRestriction:
    'The selected model could not complete this request. Retry, or choose a different model.',
  contextLength:
    'This conversation is too long for the selected model. Start a new chat, remove some attachments, or choose a model with a larger context window.',
  outputLimit:
    "The answer reached this model's maximum length and stopped there. Ask for a shorter answer, or split the request.",
  attachment:
    'This model could not read one of the attachments. Remove it, or choose a model that accepts that kind of file.',
  toolCall:
    'The model produced a tool call this request could not accept. Retry, or turn off the tools this turn does not need.',
  contentFiltered:
    'The safety system stopped this response. Rephrase the request, or try a different model.',
  planRestriction:
    'The selected model is not part of your plan. Choose a model your plan includes.',
  workspacePolicy:
    'Your workspace administrator has turned this off for your account. Ask an administrator if you need it.',
  sessionExpired: 'Your session ended before this turn finished. Sign in again, then retry.',
  accountLimit:
    'You have reached a usage limit on your account. Open Usage to see when it resets, then retry.',
  sharedFreeAllowance:
    "The free model has used up the allowance everyone on the Free plan shares, so this is not a limit on your account. It resets on the provider's schedule. Try again later, or use your own provider key.",
  interrupted:
    'The response stopped part way through. The part that arrived is kept above. Retry to get a complete answer.',
  emptyResponse: 'The model returned no response for this turn. Retry, or rephrase your message.',
};

export const INCOMPLETE_TURN_DEFAULT_MESSAGE =
  "This turn didn't complete. No response was received.";

/**
 * The id the server already put in its own log line for this failure. Shown
 * so a reader reporting a problem hands over the one string that finds the
 * turn, and only ever shown on a failure: a successful turn has nothing to
 * report.
 */
export function turnErrorReference(message: ChatMessage | undefined | null): string | null {
  const metadata = message?.metadata as
    { streamError?: { requestId?: unknown }; errorRequestId?: unknown } | undefined;
  const fromStream = metadata?.streamError?.requestId;
  if (typeof fromStream === 'string' && fromStream) return fromStream;
  const reported = metadata?.errorRequestId;
  return typeof reported === 'string' && reported ? reported : null;
}

export function withTurnErrorReference(
  text: string,
  message: ChatMessage | undefined | null,
): string {
  const reference = turnErrorReference(message);
  return reference ? `${text} Reference: ${reference}` : text;
}

/**
 * The wait the provider itself asked for, in the words a reader reads. Absent
 * unless a provider stated one: an invented "wait a few hours" is worse than
 * no sentence, because a reader who waits it out and fails again stops
 * believing the next one.
 */
const MAX_STATED_RETRY_AFTER_SECONDS = 86_400;

function counted(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

export function turnErrorRetryAfter(message: ChatMessage | undefined | null): string | null {
  const raw = (message?.metadata as { streamError?: { retryAfterSeconds?: unknown } } | undefined)
    ?.streamError?.retryAfterSeconds;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const seconds = Math.round(raw);
  if (seconds < 1 || seconds > MAX_STATED_RETRY_AFTER_SECONDS) return null;
  if (seconds < 90) return `about ${counted(seconds, 'second')}`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `about ${counted(minutes, 'minute')}`;
  return `about ${counted(Math.round(seconds / 3600), 'hour')}`;
}

export function incompleteTurnNoticeMessage(message: ChatMessage | undefined | null): string {
  return withTurnErrorReference(incompleteTurnCauseMessage(message), message);
}

function incompleteTurnCauseMessage(message: ChatMessage | undefined | null): string {
  if (message?.role === 'user') return INCOMPLETE_TURN_MESSAGE_BY_CAUSE.emptyResponse;

  const errorCode = (message?.metadata as { errorCode?: unknown } | undefined)?.errorCode;
  const cause =
    typeof errorCode === 'string' ? INCOMPLETE_TURN_CAUSE_BY_ERROR_CODE[errorCode] : undefined;
  if (cause === 'rateLimit') {
    const wait = turnErrorRetryAfter(message);
    return wait
      ? `This model is receiving too many requests right now. Try again in ${wait}, or switch to another model if your plan has one.`
      : INCOMPLETE_TURN_MESSAGE_BY_CAUSE.rateLimit;
  }
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
  if (reportedTurnError !== null) return withTurnErrorReference(reportedTurnError, lastMessage);
  if (!isIncompleteTurn(lastMessage)) return null;
  if (lastMessage?.role === 'user' && !pastGracePeriod) return null;
  return incompleteTurnNoticeMessage(lastMessage);
}
