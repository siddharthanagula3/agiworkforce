import {
  classifyError,
  SPENDING_CAP_PROVIDER_HINT,
  type ClassifiedError,
} from '@agiworkforce/provider-runtime';
import { markProviderDegraded } from '@/lib/services/provider-availability-service';

export interface UpstreamErrorShape {
  status: number;
  type: string;
  code: string;
  message: string;
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
): { message: string; code: string } {
  const mapped = mapClassifiedUpstreamError(classifyError(error), provider);
  return { message: mapped.message, code: mapped.code };
}

export function mapClassifiedUpstreamError(
  classified: ClassifiedError,
  provider: string,
): UpstreamErrorShape {
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
      const providerLabel = provider === 'google' ? 'Google' : provider;
      return {
        status: 429,
        type: 'rate_limit_error',
        code: 'provider_rate_limited',
        message: `${providerLabel} is temporarily at capacity. Try again shortly, or choose Auto to use another available model.`,
      };
    }

    case 'server_overload':
    case 'capacity_off_switch':
      markProviderDegraded(provider, classified.category);
      return {
        status: 503,
        type: 'service_unavailable',
        code: 'provider_overloaded',
        message:
          'This model is overloaded right now. Try again in a moment, or choose Auto to use another available model.',
      };

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
        message:
          'The model finished without returning a response. Try again, or choose Auto to use another available model.',
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
        message: 'The selected model is not available. Choose another model, or switch to Auto.',
      };

    case 'invalid_input':
      return {
        status: 400,
        type: 'invalid_request_error',
        code: 'provider_rejected_request',
        message:
          'The provider rejected this request as malformed. Try again, and remove any unusual attachments or parameters.',
      };

    case 'auth':
      return {
        status: 401,
        type: 'authentication_error',
        code: 'provider_credentials_rejected',
        message:
          'This model is temporarily unavailable because of a service configuration problem. Choose another model, or try again shortly.',
      };

    // Distinct from `auth` on purpose: the credential is valid, the account is
    // out of funds. Surfaced as 503 rather than 402 because it is OUR billing
    // problem, not the caller's, a user who has paid for their plan must not be
    // shown a payment-required error for an operator-side shortfall, and must
    // not be quietly served from a different paid provider instead.
    case 'billing_exhausted':
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
    case 'quota_exhausted': {
      markProviderDegraded(provider, classified.category);
      const providerLabel = provider === 'google' ? 'Google' : provider;
      const message =
        classified.providerHint === SPENDING_CAP_PROVIDER_HINT
          ? `${providerLabel}'s spending cap for this project is exceeded, so this model is unavailable right now. Pick another model or try later.`
          : `${providerLabel} capacity for this model is exhausted for now. Choose Auto to use another available model, or try again later.`;
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
        message:
          'The model could not be reached. Try again, or choose Auto to use another available model.',
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
        message:
          'The model failed to produce a response. Try again, or choose Auto to use another available model.',
      };
  }
}
