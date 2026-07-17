import { classifyError, type ClassifiedError } from '@agiworkforce/provider-runtime';
import type { StreamChunk, StreamChunkError, StreamChunkStop } from '@agiworkforce/types';

import { StreamDeadlineError } from './streamLifecycle';

export interface SafeProviderFailure {
  readonly statusCode: number;
  readonly category: string;
  readonly chunk: StreamChunkError;
}

const STOP_REASONS: ReadonlySet<StreamChunkStop['reason']> = new Set([
  'end_turn',
  'max_tokens',
  'tool_use',
  'stop_sequence',
  'error',
  'cancel',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

/** Runtime-check an untrusted value produced by a provider SDK stream. */
export function isCanonicalStreamChunk(value: unknown): value is StreamChunk {
  if (!isRecord(value) || typeof value.type !== 'string') return false;

  switch (value.type) {
    case 'text-delta':
      return typeof value.delta === 'string';
    case 'thinking-delta':
      return typeof value.delta === 'string' && isOptionalString(value.signature);
    case 'tool-use-start':
      return (
        typeof value.toolUseId === 'string' &&
        typeof value.name === 'string' &&
        (value.vendorIndex === undefined ||
          (typeof value.vendorIndex === 'number' &&
            Number.isInteger(value.vendorIndex) &&
            value.vendorIndex >= 0))
      );
    case 'tool-use-delta':
      return typeof value.toolUseId === 'string' && typeof value.deltaJson === 'string';
    case 'tool-use-end':
      return typeof value.toolUseId === 'string';
    case 'server-tool-use':
      return typeof value.toolUseId === 'string' && typeof value.name === 'string';
    case 'server-tool-result':
      return (
        typeof value.toolUseId === 'string' &&
        hasOwn(value, 'payload') &&
        isOptionalBoolean(value.isError)
      );
    case 'citation-delta':
      return (
        typeof value.blockIndex === 'number' &&
        Number.isInteger(value.blockIndex) &&
        value.blockIndex >= 0 &&
        hasOwn(value, 'payload')
      );
    case 'vendor-raw':
      return hasOwn(value, 'payload');
    case 'response-meta':
      return (
        isOptionalString(value.id) &&
        isOptionalFiniteNumber(value.created) &&
        isOptionalString(value.systemFingerprint) &&
        isOptionalString(value.serviceTier)
      );
    case 'usage':
      return [
        value.inputTokens,
        value.outputTokens,
        value.cacheReadTokens,
        value.cacheWriteTokens,
        value.cacheWrite1hTokens,
        value.reasoningTokens,
      ].every((tokenCount) => {
        return (
          tokenCount === undefined ||
          (typeof tokenCount === 'number' && Number.isFinite(tokenCount) && tokenCount >= 0)
        );
      });
    case 'error':
      return (
        typeof value.message === 'string' &&
        isOptionalString(value.code) &&
        isOptionalBoolean(value.retryable) &&
        (value.retryAfterSeconds === undefined ||
          (typeof value.retryAfterSeconds === 'number' &&
            Number.isFinite(value.retryAfterSeconds) &&
            value.retryAfterSeconds >= 0))
      );
    case 'stop':
      return (
        typeof value.reason === 'string' &&
        STOP_REASONS.has(value.reason as StreamChunkStop['reason'])
      );
    default:
      return false;
  }
}

function classificationInput(error: unknown): unknown {
  if (!isRecord(error)) return error;

  const rawMessage = error.message;
  const rawName = error instanceof Error ? error.name : error.name;
  const rawCode = error.code;
  const message = typeof rawMessage === 'string' ? rawMessage : 'Unknown provider error';

  // The shared classifier recognizes transport codes in the message/name.
  // SDK Error.code is commonly non-enumerable or not inspected by the
  // classifier, so include a bounded code prefix for classification only.
  const codePrefix =
    typeof rawCode === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(rawCode) ? `${rawCode}: ` : '';

  return {
    ...error,
    message: `${codePrefix}${message}`,
    ...(typeof rawName === 'string' ? { name: rawName } : {}),
  };
}

function canonicalErrorInput(chunk: StreamChunkError): Record<string, unknown> {
  const status =
    typeof chunk.code === 'string' && /^\d{3}$/.test(chunk.code)
      ? Number.parseInt(chunk.code, 10)
      : undefined;
  return {
    message: chunk.message,
    ...(status !== undefined ? { status } : {}),
  };
}

function safeProviderMessage(classified: ClassifiedError): string {
  switch (classified.category) {
    case 'api_timeout':
      return 'The upstream provider timed out. Please retry.';
    case 'rate_limit':
      return 'Upstream provider rate limit exceeded. Please retry later.';
    case 'connection':
      return 'The upstream provider connection failed. Please retry.';
    case 'server_overload':
    case 'server_error':
    case 'capacity_off_switch':
      return 'Upstream provider is temporarily unavailable. Please retry.';
    case 'context_overflow':
      return 'The request exceeds the selected model context window.';
    case 'auth':
      return 'The configured upstream provider credentials were rejected.';
    case 'invalid_model':
      return 'The upstream provider rejected the selected model.';
    case 'media_too_large':
      return 'The upstream provider rejected the request media.';
    case 'safety':
      return 'The upstream provider declined this request.';
    default:
      return 'The upstream provider request failed. Please retry.';
  }
}

function safeProviderStatus(classified: ClassifiedError): number {
  switch (classified.category) {
    case 'api_timeout':
      return 504;
    case 'rate_limit':
      return 429;
    case 'connection':
    case 'server_overload':
    case 'server_error':
    case 'capacity_off_switch':
      return 503;
    default:
      // Provider auth/client errors are failures of the managed gateway's
      // upstream integration, not failures of the caller's AGI session.
      return 502;
  }
}

function safeProviderCode(classified: ClassifiedError, fallbackCode?: string): string {
  if (classified.code !== 'unknown') return classified.code;
  return fallbackCode && /^[A-Za-z0-9_.-]{1,64}$/.test(fallbackCode)
    ? fallbackCode
    : 'provider_error';
}

export function toSafeProviderFailure(
  error: unknown,
  canonicalError?: StreamChunkError,
): SafeProviderFailure {
  if (error instanceof StreamDeadlineError) {
    return {
      statusCode: 504,
      category: 'api_timeout',
      chunk: {
        type: 'error',
        message: 'The upstream provider timed out. Please retry.',
        code: 'gateway_deadline_exceeded',
        retryable: true,
      },
    };
  }

  const classified = classifyError(
    canonicalError ? canonicalErrorInput(canonicalError) : classificationInput(error),
  );
  return {
    statusCode: safeProviderStatus(classified),
    category: classified.category,
    chunk: {
      type: 'error',
      message: safeProviderMessage(classified),
      code: safeProviderCode(classified, canonicalError?.code),
      retryable: canonicalError?.retryable ?? classified.retryable,
      ...(canonicalError?.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: canonicalError.retryAfterSeconds }
        : classified.retryAfterSeconds !== undefined
          ? { retryAfterSeconds: classified.retryAfterSeconds }
          : {}),
    },
  };
}

/**
 * Managed failover admission (AUTO-ROUTER-MIGRATION-01): only availability
 * failures of the upstream transport — 5xx-class, connection, or a provider
 * timeout — may rotate to the resolver's next cross-provider fallback route.
 * Terminal credential failures and provider rate limits never rotate (pinned
 * in `__tests__/routes/llm-provider-model-id.test.ts`), and the gateway-owned
 * deadline never rotates because the shared per-request deadline has already
 * expired, so a further attempt could not run to completion anyway.
 */
const FAILOVER_ELIGIBLE_CATEGORIES: ReadonlySet<string> = new Set([
  'connection',
  'server_error',
  'server_overload',
  'capacity_off_switch',
  'api_timeout',
]);

export function isFailoverEligibleFailure(failure: SafeProviderFailure): boolean {
  if (failure.chunk.code === 'gateway_deadline_exceeded') return false;
  return FAILOVER_ELIGIBLE_CATEGORIES.has(failure.category);
}

export function malformedStreamFailure(): SafeProviderFailure {
  return {
    statusCode: 502,
    category: 'invalid_stream_event',
    chunk: {
      type: 'error',
      message: 'The upstream provider returned an invalid stream event. Please retry.',
      code: 'invalid_stream_event',
      retryable: true,
    },
  };
}

export function incompleteStreamFailure(): SafeProviderFailure {
  return {
    statusCode: 502,
    category: 'incomplete_stream',
    chunk: {
      type: 'error',
      message: 'The upstream provider stream ended unexpectedly. Please retry.',
      code: 'incomplete_stream',
      retryable: true,
    },
  };
}
