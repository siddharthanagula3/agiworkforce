/**
 * Error Types
 *
 * Standardized error types and codes used across all applications.
 * These provide consistent error handling and reporting.
 *
 * @module errors
 * @packageDocumentation
 */

export const ErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  MFA_REQUIRED: 'MFA_REQUIRED',
  IP_NOT_ALLOWED: 'IP_NOT_ALLOWED',

  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',

  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',

  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  /**
   * A capability this deployment does not offer, as opposed to one that broke.
   *
   * Separate from SERVICE_UNAVAILABLE so its message can reach the reader: the
   * generic 503 text is deliberately opaque because most 503s carry internal
   * detail, but "Managed Code is not enabled for this deployment" is written
   * for the reader and is useless if replaced.
   */
  CAPABILITY_UNAVAILABLE: 'CAPABILITY_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',

  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  STRIPE_ERROR: 'STRIPE_ERROR',
  CLOUD_DB_ERROR: 'CLOUD_DB_ERROR',
  PGRST116: 'PGRST116',

  NETWORK_ERROR: 'NETWORK_ERROR',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  INVALID_RESPONSE: 'INVALID_RESPONSE',

  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Refusal codes, one per thing that can refuse a request. FORBIDDEN and
 * CAPABILITY_UNAVAILABLE stood for all of these, so no reader could tell an
 * admin switch from a missing plan from an unsupported route.
 */
export const DenialErrorCode = {
  DISABLED_BY_USER: 'DISABLED_BY_USER',
  DISABLED_BY_ORGANIZATION: 'DISABLED_BY_ORGANIZATION',
  DISABLED_BY_WORKSPACE: 'DISABLED_BY_WORKSPACE',

  UNSUPPORTED_BY_PROVIDER: 'UNSUPPORTED_BY_PROVIDER',
  UNSUPPORTED_BY_ROUTE: 'UNSUPPORTED_BY_ROUTE',
  UNSUPPORTED_BY_SURFACE: 'UNSUPPORTED_BY_SURFACE',

  PERMISSION_REQUIRED: 'PERMISSION_REQUIRED',
  CONNECTED_ACCOUNT_REQUIRED: 'CONNECTED_ACCOUNT_REQUIRED',
  DESKTOP_HOST_REQUIRED: 'DESKTOP_HOST_REQUIRED',

  UPGRADE_REQUIRED: 'UPGRADE_REQUIRED',
  SEAT_REQUIRED: 'SEAT_REQUIRED',
  ENTITLEMENT_REQUIRED: 'ENTITLEMENT_REQUIRED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',

  POLICY_BLOCKED: 'POLICY_BLOCKED',

  PROVIDER_DEGRADED: 'PROVIDER_DEGRADED',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  OFFLINE: 'OFFLINE',

  FEATURE_EXPERIMENTAL: 'FEATURE_EXPERIMENTAL',
  FEATURE_CLOSED_BETA: 'FEATURE_CLOSED_BETA',
  FEATURE_DEPRECATED: 'FEATURE_DEPRECATED',
} as const;

export type DenialErrorCodeValue = (typeof DenialErrorCode)[keyof typeof DenialErrorCode];

export type AnyErrorCodeValue = ErrorCodeValue | DenialErrorCodeValue;

/**
 * Standard API error response format.
 *
 * @example
 * ```typescript
 * const error: ApiError = {
 *   code: ErrorCode.VALIDATION_ERROR,
 *   message: 'Email is required',
 *   statusCode: 400,
 *   details: { field: 'email' },
 * };
 * ```
 */
export interface ApiError {
  code: ErrorCodeValue;
  message: string;
  details?: unknown;
  statusCode: number;
}

export interface CodedError extends Error {
  code: string;
}

/**
 * Type guard to check if an error has a code property.
 *
 * @param error - Value to check
 * @returns Whether the value is a CodedError
 *
 * @example
 * ```typescript
 * try {
 *   await someOperation();
 * } catch (error) {
 *   if (isCodedError(error)) {
 *     console.log('Error code:', error.code);
 *   }
 * }
 * ```
 */
export function isCodedError(error: unknown): error is CodedError {
  return (
    error instanceof Error && 'code' in error && typeof (error as CodedError).code === 'string'
  );
}

export const HTTP_STATUS_TO_ERROR_CODE: Record<number, ErrorCodeValue> = {
  400: ErrorCode.VALIDATION_ERROR,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  413: ErrorCode.PAYLOAD_TOO_LARGE,
  429: ErrorCode.RATE_LIMIT_EXCEEDED,
  500: ErrorCode.INTERNAL_ERROR,
  502: ErrorCode.SERVICE_UNAVAILABLE,
  503: ErrorCode.SERVICE_UNAVAILABLE,
  504: ErrorCode.TIMEOUT,
};

export const ERROR_CODE_TO_HTTP_STATUS: Record<ErrorCodeValue, number> = {
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.MFA_REQUIRED]: 403,
  [ErrorCode.IP_NOT_ALLOWED]: 403,
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.INVALID_INPUT]: 400,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.CAPABILITY_UNAVAILABLE]: 503,
  [ErrorCode.TIMEOUT]: 504,
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
  [ErrorCode.STRIPE_ERROR]: 502,
  [ErrorCode.CLOUD_DB_ERROR]: 502,
  [ErrorCode.PGRST116]: 404,
  [ErrorCode.NETWORK_ERROR]: 503,
  [ErrorCode.PAYLOAD_TOO_LARGE]: 413,
  [ErrorCode.INVALID_RESPONSE]: 502,
  [ErrorCode.PAYMENT_REQUIRED]: 402,
};

export const DENIAL_ERROR_CODE_TO_HTTP_STATUS: Record<DenialErrorCodeValue, number> = {
  [DenialErrorCode.DISABLED_BY_USER]: 403,
  [DenialErrorCode.DISABLED_BY_ORGANIZATION]: 403,
  [DenialErrorCode.DISABLED_BY_WORKSPACE]: 403,
  [DenialErrorCode.UNSUPPORTED_BY_PROVIDER]: 501,
  [DenialErrorCode.UNSUPPORTED_BY_ROUTE]: 501,
  [DenialErrorCode.UNSUPPORTED_BY_SURFACE]: 501,
  [DenialErrorCode.PERMISSION_REQUIRED]: 403,
  [DenialErrorCode.CONNECTED_ACCOUNT_REQUIRED]: 428,
  [DenialErrorCode.DESKTOP_HOST_REQUIRED]: 428,
  [DenialErrorCode.UPGRADE_REQUIRED]: 402,
  [DenialErrorCode.SEAT_REQUIRED]: 402,
  [DenialErrorCode.ENTITLEMENT_REQUIRED]: 403,
  [DenialErrorCode.QUOTA_EXCEEDED]: 429,
  [DenialErrorCode.POLICY_BLOCKED]: 403,
  [DenialErrorCode.PROVIDER_DEGRADED]: 503,
  [DenialErrorCode.PROVIDER_UNAVAILABLE]: 503,
  [DenialErrorCode.OFFLINE]: 503,
  [DenialErrorCode.FEATURE_EXPERIMENTAL]: 403,
  [DenialErrorCode.FEATURE_CLOSED_BETA]: 403,
  [DenialErrorCode.FEATURE_DEPRECATED]: 410,
};

export function isDenialErrorCode(code: string): code is DenialErrorCodeValue {
  return Object.prototype.hasOwnProperty.call(DENIAL_ERROR_CODE_TO_HTTP_STATUS, code);
}

export function errorCodeHttpStatus(code: AnyErrorCodeValue): number {
  return isDenialErrorCode(code)
    ? DENIAL_ERROR_CODE_TO_HTTP_STATUS[code]
    : (ERROR_CODE_TO_HTTP_STATUS[code] ?? 500);
}

export interface FriendlyError {
  title: string;
  message: string;
  suggestion?: string;
  icon?: 'error' | 'warning' | 'info' | 'network' | 'payment' | 'auth';
}
