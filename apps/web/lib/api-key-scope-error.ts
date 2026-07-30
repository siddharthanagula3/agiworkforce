import 'server-only';

import { AppError, ErrorCode, isAppError } from '@/lib/errors';

const API_KEY_SCOPE_ERROR_REASON = 'api_key_scope';

export class ApiKeyScopeError extends AppError {
  constructor(message: string) {
    super(ErrorCode.FORBIDDEN, message, 403, { reason: API_KEY_SCOPE_ERROR_REASON });
    this.name = 'ApiKeyScopeError';
    Object.setPrototypeOf(this, ApiKeyScopeError.prototype);
  }
}

export function isApiKeyScopeError(error: unknown): error is ApiKeyScopeError {
  return (
    isAppError(error) &&
    (error.details as { reason?: unknown } | undefined)?.reason === API_KEY_SCOPE_ERROR_REASON
  );
}
