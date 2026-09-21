import {
  classifyError,
  FREE_POOL_PROVIDER_HINT,
  SPENDING_CAP_PROVIDER_HINT,
  type ClassifiedError,
} from '@agiworkforce/provider-runtime';
import {
  getProviderDisplayLabel,
  getRoutingSlotModel,
  isAutoModeModelId,
  normalizeModelId,
} from '@agiworkforce/types';
import { markProviderDegraded } from '@/lib/services/provider-availability-service';
import { logger } from '@/lib/logger';
import { getRequestId, getTraceContext } from '@/lib/observability/trace-context';

export interface UpstreamErrorShape {
  status: number;
  type: string;
  code: string;
  message: string;
  /**
   * Seconds the upstream response itself asked us to wait, never a guess. A
   * reader told to wait a period nobody measured learns to ignore the number,
   * so the field is absent unless a provider supplied it.
   */
  retryAfterSeconds?: number;
  /**
   * The id this same failure carries in the server log line and in the
   * `REQUEST_ID_HEADER` of the response, so a reader quoting it gives support
   * the one string that finds the turn.
   */
  requestId?: string;
}

/**
 * The shape a mid-stream failure travels to the client in.
 *
 * Built here rather than at each emitter because the three that exist were
 * each assembling their own `{ message, code, retryable }` literal, and a
 * field added for one of them reached the client from one code path only.
 */
export interface StreamErrorFrame {
  message: string;
  code: string;
  retryable: boolean;
  retryAfterSeconds?: number;
  requestId?: string;
}

export function streamErrorFrame(shape: UpstreamErrorShape, retryable: boolean): StreamErrorFrame {
  return {
    message: shape.message,
    code: shape.code,
    retryable,
    ...(shape.retryAfterSeconds !== undefined
      ? { retryAfterSeconds: shape.retryAfterSeconds }
      : {}),
    ...(shape.requestId !== undefined ? { requestId: shape.requestId } : {}),
  };
}

/**
 * What the caller asked for, which decides what the reader is told to do next.
 *
 * Seven of the messages below used to end in "choose Auto", and a request
 * already on Auto is the one that most often reaches them: Auto is what
 * rotates, so the copy lands only once the rotation is over. It told a user who
 * had already made the right choice to make it again. The Auto wording names
 * the one move left instead, and claims nothing about how far the rotation got,
 * which this boundary cannot see. `requestedModel` is the pre-routing
 * selection, not the model that served, so it answers the question directly.
 */
export interface UpstreamErrorContext {
  requestedModel?: string | undefined;
}

const PICK_A_MODEL = 'pick a specific model from the model picker';

// The reader's OWN limit: it names their account, points at where the reset is
// shown, and never reads as a provider's problem or a self serve upsell.
export const FREE_USAGE_LIMIT_REACHED_MESSAGE =
  'You have reached the free usage limit on your account. Open Usage to see when it resets, or use your own provider key to keep going. Paid upgrades are opening in stages, so they need an access code or a place on the upgrade waitlist.';

// The free plan has one model and no Auto, so its copy names the only move left.
const FREE_ROUTER_SHARED_CAPACITY =
  'Free models share upstream capacity, so this happens at busy times.';

function isFreeRouter(requestedModel: string | undefined): boolean {
  if (!requestedModel) return false;
  return (
    (normalizeModelId(requestedModel) ?? requestedModel) === getRoutingSlotModel('router_zero_cost')
  );
}

/**
 * A day is the longest wait any message here can state and stay useful; past it
 * the figure is a provider's own clock skew or a header we misread, and a
 * sentence built on it would be worse than no sentence.
 */
const MAX_STATED_RETRY_AFTER_SECONDS = 86_400;

function statableRetryAfterSeconds(raw: number | undefined): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  const seconds = Math.round(raw);
  if (seconds < 1 || seconds > MAX_STATED_RETRY_AFTER_SECONDS) return undefined;
  return seconds;
}

function counted(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

function statedWait(seconds: number): string {
  if (seconds < 90) return `about ${counted(seconds, 'second')}`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `about ${counted(minutes, 'minute')}`;
  return `about ${counted(Math.round(seconds / 3600), 'hour')}`;
}

/**
 * The clause that tells a reader when to come back. `vague` is what it says
 * when no provider stated a time, and it never mentions one.
 */
function retryClause(retryAfterSeconds: number | undefined, vague: string): string {
  return retryAfterSeconds === undefined ? vague : `Try again in ${statedWait(retryAfterSeconds)}`;
}

function correlationId(): string | undefined {
  return getRequestId() ?? getTraceContext()?.traceId ?? undefined;
}

/**
 * Copy that interpolates a value the reader supplied, flattened to the one
 * line a notice renders. A filename is the reader's own text: it carries
 * newlines, control characters and whatever a stack frame pasted into it
 * looks like, and none of that belongs in a sentence about their attachment.
 */
const MAX_INTERPOLATED_DETAIL_CHARS = 300;
const STACK_FRAME = /\s+at\s+\S+\s*\(?[^)]*\)?/g;
const FILESYSTEM_PATH = /(?:[A-Za-z]:\\|file:\/\/|\/)(?:[\w.-]+[/\\])+[\w.-]+/g;
const LAST_C0_CONTROL = 0x1f;
const FIRST_C1_CONTROL = 0x7f;
const LAST_C1_CONTROL = 0x9f;

function withoutControlCharacters(raw: string): string {
  let out = '';
  for (const character of raw) {
    const code = character.codePointAt(0) ?? 0;
    const isControl =
      code <= LAST_C0_CONTROL || (code >= FIRST_C1_CONTROL && code <= LAST_C1_CONTROL);
    out += isControl ? ' ' : character;
  }
  return out;
}

function flattenInterpolatedDetail(raw: string): string {
  const flattened = withoutControlCharacters(raw)
    .replace(STACK_FRAME, ' ')
    .replace(FILESYSTEM_PATH, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return flattened.length > MAX_INTERPOLATED_DETAIL_CHARS
    ? `${flattened.slice(0, MAX_INTERPOLATED_DETAIL_CHARS).trimEnd()}...`
    : flattened;
}

/**
 * The boundary a thrown tool failure crosses to become a visible tool-result
 * card. A tool's `execute()` throws whatever its SDK, driver or sandbox threw,
 * and that value carries stack frames, absolute paths and internal hostnames
 * that a secret-pattern scan does not match and a reader has no use for. The
 * condition survives, so the model can still adapt; the machine it happened on
 * does not.
 */
export function toolFailureMessage(toolName: string, error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const detail = flattenInterpolatedDetail(raw);
  return detail
    ? `Tool ${toolName} failed: ${detail}`
    : `Tool ${toolName} failed. Try again, or turn that tool off for this turn.`;
}

/**
 * The boundary a thrown provider failure crosses to become text a reader sees.
 *
 * Every caller that reports a failure to the client goes through here, because
 * an upstream SDK's `message` is not copy: at least one provider formats it as
 * the HTTP status followed by the verbatim JSON error body, and emitting that
 * put a provider's raw payload in the transcript. A failure that is not an
 * upstream refusal classifies as `unknown` and still gets taxonomy copy rather
 * than an exception's internals.
 */
export function upstreamFailureCopy(
  error: unknown,
  provider: string,
  context?: UpstreamErrorContext,
): { message: string; code: string } {
  const mapped = mapClassifiedUpstreamError(classifyError(error), provider, context);
  return { message: mapped.message, code: mapped.code };
}

const REJECTION_CATEGORIES: ReadonlySet<ClassifiedError['category']> = new Set([
  'invalid_input',
  'client_error',
  'unsupported_input',
]);
const MAX_LOGGED_PROVIDER_MESSAGE_CHARS = 2_000;
const PRODUCTION_ENV = 'production';

function logProviderRejection(classified: ClassifiedError, provider: string): void {
  if (!REJECTION_CATEGORIES.has(classified.category)) return;
  logger.warn(
    {
      provider,
      category: classified.category,
      providerCode: classified.code,
      status: classified.status,
      requestId: correlationId(),
      ...(process.env['NODE_ENV'] === PRODUCTION_ENV
        ? {}
        : { providerMessage: classified.message.slice(0, MAX_LOGGED_PROVIDER_MESSAGE_CHARS) }),
    },
    '[upstream] provider rejected the request',
  );
}

export function mapClassifiedUpstreamError(
  classified: ClassifiedError,
  provider: string,
  context?: UpstreamErrorContext,
): UpstreamErrorShape {
  logProviderRejection(classified, provider);
  const retryAfterSeconds = statableRetryAfterSeconds(classified.retryAfterSeconds);
  const requestId = correlationId();
  return {
    ...upstreamCopy(classified, provider, context, retryAfterSeconds),
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    ...(requestId !== undefined ? { requestId } : {}),
  };
}

function upstreamCopy(
  classified: ClassifiedError,
  provider: string,
  context: UpstreamErrorContext | undefined,
  retryAfterSeconds: number | undefined,
): { status: number; type: string; code: string; message: string } {
  const onAuto = isAutoModeModelId(context?.requestedModel);
  const onFreeRouter = isFreeRouter(context?.requestedModel);
  const providerLabel = getProviderDisplayLabel(provider);
  switch (classified.category) {
    case 'aborted':
      return {
        status: 499,
        type: 'request_cancelled',
        code: 'request_cancelled',
        message: 'The request was cancelled before the model finished.',
      };

    case 'api_timeout':
      return {
        status: 504,
        type: 'timeout_error',
        code: 'provider_timeout',
        message:
          'The model took too long to respond. Try again, or pick a faster model from the model picker.',
      };

    case 'rate_limit': {
      const clause = retryClause(retryAfterSeconds, 'Try again shortly');
      return {
        status: 429,
        type: 'rate_limit_error',
        code: 'provider_rate_limited',
        message: onFreeRouter
          ? `The free model is busy right now. ${FREE_ROUTER_SHARED_CAPACITY} ${retryClause(retryAfterSeconds, 'Try again in a moment')}.`
          : onAuto
            ? `${providerLabel} is temporarily at capacity. ${clause}, or ${PICK_A_MODEL}.`
            : `${providerLabel} is temporarily at capacity. ${clause}, or choose Auto to use another available model.`,
      };
    }

    case 'server_overload':
    case 'capacity_off_switch': {
      markProviderDegraded(provider, classified.category);
      const clause = retryClause(retryAfterSeconds, 'Try again in a moment');
      return {
        status: 503,
        type: 'service_unavailable',
        code: 'provider_overloaded',
        message: onFreeRouter
          ? `The free model is overloaded right now. ${FREE_ROUTER_SHARED_CAPACITY} ${clause}.`
          : onAuto
            ? `This model is overloaded right now. ${clause}, or ${PICK_A_MODEL}.`
            : `This model is overloaded right now. ${clause}, or choose Auto to use another available model.`,
      };
    }

    case 'context_overflow':
      return {
        status: 400,
        type: 'invalid_request_error',
        code: 'context_length_exceeded',
        message:
          'This conversation is too long for the selected model. Start a new chat, remove some attachments, or choose a model with a larger context window.',
      };

    case 'max_output':
      return {
        status: 400,
        type: 'invalid_request_error',
        code: 'max_output_tokens_exceeded',
        message:
          'The response hit the maximum output length for this model. Ask for a shorter answer, or split the request.',
      };

    case 'safety':
      return {
        status: 400,
        type: 'content_filter',
        code: 'content_filter',
        message:
          "The provider's safety system stopped this response. Rephrase the request, or try a different model.",
      };

    // Same content-policy stop as `safety`, observed through a clean,
    // non-throwing stream termination instead of a thrown error.
    case 'content_blocked':
      return {
        status: 400,
        type: 'content_filter',
        code: 'content_blocked',
        message:
          'The model blocked this response before returning any content. Rephrase the request, or try a different model.',
      };

    case 'empty_response':
      return {
        status: 502,
        type: 'upstream_error',
        code: 'empty_response',
        message: onFreeRouter
          ? 'The model finished without returning a response. Try again in a moment.'
          : onAuto
            ? `The model finished without returning a response. Try again, or ${PICK_A_MODEL}.`
            : 'The model finished without returning a response. Try again, or choose Auto to use another available model.',
      };

    case 'media_too_large':
      return {
        status: 400,
        type: 'invalid_request_error',
        code: 'attachment_too_large',
        message:
          'An attachment is too large for the selected model. Remove or shrink it, or choose a model with larger media limits.',
      };

    case 'tool_validation':
      return {
        status: 400,
        type: 'invalid_request_error',
        code: 'tool_call_invalid',
        message:
          'The model produced a tool call this request could not accept. Try again, or turn off the tools you do not need for this turn.',
      };

    case 'invalid_model':
      return {
        status: 404,
        type: 'not_found',
        code: 'model_not_found',
        message: onFreeRouter
          ? 'The free model is not available right now. Try again in a moment.'
          : onAuto
            ? `The model Auto selected is not available. Try again, or ${PICK_A_MODEL}.`
            : 'The selected model is not available. It may have been retired. Choose another model, or switch to Auto.',
      };

    case 'invalid_input':
      return {
        status: 400,
        type: 'invalid_request_error',
        code: 'provider_rejected_request',
        message:
          'The provider rejected this request as malformed. Try again, and remove any unusual attachments or parameters.',
      };

    // Auto rotates this class, so reaching the user means every route in the
    // plan said the same thing. The message names the attachment rather than
    // blaming the request, because the request was fine.
    case 'unsupported_input': {
      const detail = flattenInterpolatedDetail(classified.message);
      return {
        status: 400,
        type: 'invalid_request_error',
        code: 'unsupported_attachment',
        message: detail
          ? detail
          : 'This model cannot read one of the attachments. Choose a model that accepts it, or attach the content as text.',
      };
    }

    case 'auth':
      return {
        status: 401,
        type: 'authentication_error',
        code: 'provider_credentials_rejected',
        message:
          'This model is temporarily unavailable because of a service configuration problem on our side, not with your request. Choose another model, or try again shortly.',
      };

    // Distinct from `auth` on purpose: the credential is valid, the account is
    // out of funds. Surfaced as 503 rather than 402 because it is OUR billing
    // problem, not the caller's, a user who has paid for their plan must not be
    // shown a payment-required error for an operator-side shortfall, and must
    // not be quietly served from a different paid provider instead.
    // Marked degraded for the same reason a spent quota is: every subsequent
    // request to this provider fails identically until a human tops the account
    // up, so the catalogue must stop presenting it as ready. Measured on
    // 2026-09-12, when Anthropic answered every Claude route with a 400 "credit
    // balance is too low" and the catalogue kept offering Claude as selectable.
    case 'billing_exhausted':
      markProviderDegraded(provider, classified.category);
      return {
        status: 503,
        type: 'service_unavailable',
        code: 'provider_billing_exhausted',
        message:
          'This model is unavailable right now because of a problem on our side, not with your request. Choose another model, or try again shortly.',
      };

    // The quota WINDOW is spent, as opposed to a momentary rate limit. Same
    // user-facing shape as a rate limit, different routing consequence upstream
    // (the pool is taken out of service until it resets rather than retried).
    // On the free plan it is the one pool every reader on that plan shares, so
    // the copy says whose limit it is: naming it "your" limit sent readers to
    // check an account that had nothing wrong with it.
    case 'quota_exhausted': {
      const clause = retryClause(retryAfterSeconds, 'Try again later');
      const message =
        classified.providerHint === SPENDING_CAP_PROVIDER_HINT
          ? `${providerLabel}'s spending cap for this project is exceeded, so this model is unavailable right now. Pick another model or try later.`
          : onFreeRouter || classified.providerHint === FREE_POOL_PROVIDER_HINT
            ? `The free model has used up the allowance everyone on the Free plan shares, so this is not a limit on your account. ${
                retryAfterSeconds === undefined
                  ? "It resets on the provider's schedule. Try again later."
                  : `${clause}.`
              }`
            : onAuto
              ? `${providerLabel} capacity for this model is exhausted for now. ${clause}, or ${PICK_A_MODEL}.`
              : `${providerLabel} capacity for this model is exhausted for now. Choose Auto to use another available model, or ${clause.toLowerCase()}.`;
      // A spent free pool says nothing about the provider's paid routes, so it
      // must not take the provider out of the ready set for everyone else.
      if (classified.providerHint !== FREE_POOL_PROVIDER_HINT) {
        markProviderDegraded(provider, classified.category);
      }
      return {
        status: 429,
        type: 'rate_limit_error',
        code: 'provider_quota_exhausted',
        message,
      };
    }

    case 'connection':
      return {
        status: 502,
        type: 'upstream_error',
        code: 'provider_unreachable',
        message: onFreeRouter
          ? 'The model could not be reached. Try again in a moment.'
          : onAuto
            ? `The model could not be reached. Try again, or ${PICK_A_MODEL}.`
            : 'The model could not be reached. Try again, or choose Auto to use another available model.',
      };

    case 'pause_turn':
      return {
        status: 502,
        type: 'upstream_error',
        code: 'provider_paused_turn',
        message: 'The model paused mid-turn and could not continue. Try again.',
      };

    case 'client_error':
      return {
        status: 400,
        type: 'invalid_request_error',
        code: 'provider_rejected_request',
        message: 'The provider rejected this request. Try again, or choose another model.',
      };

    case 'server_error':
    case 'unknown':
      return {
        status: 502,
        type: 'upstream_error',
        code: 'provider_error',
        message: onFreeRouter
          ? 'The model failed to produce a response. Try again in a moment.'
          : onAuto
            ? `The model failed to produce a response. Try again, or ${PICK_A_MODEL}.`
            : 'The model failed to produce a response. Try again, or choose Auto to use another available model.',
      };
  }
}
