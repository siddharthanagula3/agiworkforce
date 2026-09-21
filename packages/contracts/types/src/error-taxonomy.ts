/**
 * What kind of failure this is, once, for every surface. A code says which
 * thing went wrong; a class says what the reader should understand from it and
 * what may be done about it. Before this file a storage outage, a refused
 * policy and a defect all arrived as one status and one sentence.
 *
 * `scripts/check-error-model.mjs` resolves every code in the canonical
 * registries against this table, so a code added without a class fails.
 *
 * @module error-taxonomy
 */

import taxonomyJson from './error-taxonomy.json' with { type: 'json' };
import { errorCodeHttpStatus, type ClassifiedErrorCode, type FriendlyError } from './errors';
import type { SurfaceRemedy } from './lifecycle-status';

export const ERROR_CLASSES = [
  'authentication',
  'authorization',
  'policy',
  'entitlement',
  'validation',
  'unsupported',
  'conflict',
  'not_found',
  'deleted',
  'rate_limit',
  'quota',
  'provider_unavailable',
  'timeout',
  'network',
  'offline',
  'storage',
  'database',
  'search',
  'tool',
  'connector',
  'sandbox',
  'safety',
  'internal',
] as const;

export type ErrorClass = (typeof ERROR_CLASSES)[number];

/**
 * How much of an upstream's own words may reach the reader. `summary` is the
 * upstream's name and its stated status, never its response body, because a
 * body carries prompts, keys and other callers' identifiers.
 */
export const PROVIDER_DETAIL_DISCLOSURES = ['hidden', 'summary'] as const;

export type ProviderDetailDisclosure = (typeof PROVIDER_DETAIL_DISCLOSURES)[number];

export interface ErrorClassRule {
  why: string;
  /** Decided here and carried on the wire; a client reads it and never derives it. */
  retryable: boolean;
  providerDetail: ProviderDetailDisclosure;
  suggestedAction: SurfaceRemedy;
  codes: readonly ClassifiedErrorCode[];
}

export const ERROR_CLASS_RULES = taxonomyJson.classes as Readonly<
  Record<ErrorClass, ErrorClassRule>
>;

export const ERROR_CLASS_MESSAGE_KEY_PREFIX = 'error.class';

export function errorClassMessageKey(errorClass: ErrorClass): string {
  return `${ERROR_CLASS_MESSAGE_KEY_PREFIX}.${errorClass}`;
}

const CODE_CLASS: ReadonlyMap<string, ErrorClass> = new Map(
  ERROR_CLASSES.flatMap((errorClass) =>
    ERROR_CLASS_RULES[errorClass].codes.map((code) => [code as string, errorClass] as const),
  ),
);

export function isErrorClass(value: string): value is ErrorClass {
  return (ERROR_CLASSES as readonly string[]).includes(value);
}

export function classifyErrorCode(code: ClassifiedErrorCode): ErrorClass {
  return CODE_CLASS.get(code) ?? 'internal';
}

export function isClassifiedErrorCode(code: string): boolean {
  return CODE_CLASS.has(code);
}

export function isRetryableErrorCode(code: ClassifiedErrorCode): boolean {
  return ERROR_CLASS_RULES[classifyErrorCode(code)].retryable;
}

/**
 * The answer a caller gets. Every field is required: an error without a
 * request id cannot be followed up, and one without a suggested action leaves
 * the reader with nothing to do.
 */
export interface UserFacingError {
  code: ClassifiedErrorCode;
  errorClass: ErrorClass;
  httpStatus: number;
  retryable: boolean;
  suggestedAction: SurfaceRemedy;
  messageKey: string;
  message: string;
  requestId: string;
  /** The upstream's name and status, when the class admits it; null otherwise. */
  providerDetail: string | null;
}

export interface ProviderFailureDetail {
  provider: string;
  status: string;
}

export interface DescribeErrorInput {
  code: ClassifiedErrorCode;
  requestId: string;
  /** Resolves the message key in the reader's locale; the fallback is English. */
  lookup?: (messageKey: string) => string | undefined;
  fallbackMessage?: string;
  provider?: ProviderFailureDetail;
}

/**
 * An upstream's detail reaches the reader only as the two fields we control.
 * Anything it said for itself is dropped rather than trimmed, because a
 * truncated body is still a body.
 */
export function discloseProviderDetail(
  errorClass: ErrorClass,
  provider: ProviderFailureDetail | undefined,
): string | null {
  if (provider === undefined) return null;
  if (ERROR_CLASS_RULES[errorClass].providerDetail !== 'summary') return null;
  return `${provider.provider}: ${provider.status}`;
}

export function describeError(input: DescribeErrorInput): UserFacingError {
  const errorClass = classifyErrorCode(input.code);
  const rule = ERROR_CLASS_RULES[errorClass];
  const messageKey = errorClassMessageKey(errorClass);
  return {
    code: input.code,
    errorClass,
    httpStatus: errorCodeHttpStatus(input.code),
    retryable: rule.retryable,
    suggestedAction: rule.suggestedAction,
    messageKey,
    message: input.lookup?.(messageKey) ?? input.fallbackMessage ?? rule.why,
    requestId: input.requestId,
    providerDetail: discloseProviderDetail(errorClass, input.provider),
  };
}

export function friendlyErrorIcon(errorClass: ErrorClass): NonNullable<FriendlyError['icon']> {
  switch (errorClass) {
    case 'authentication':
    case 'authorization':
      return 'auth';
    case 'entitlement':
    case 'quota':
      return 'payment';
    case 'network':
    case 'offline':
      return 'network';
    case 'validation':
    case 'policy':
    case 'unsupported':
    case 'conflict':
    case 'rate_limit':
    case 'safety':
      return 'warning';
    default:
      return 'error';
  }
}
