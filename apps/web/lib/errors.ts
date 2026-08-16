/**
 * Standardized error types and utilities for API routes
 *
 * This module re-exports error utilities from @agiworkforce/utils for
 * consistency across the codebase. New code should prefer importing
 * directly from @agiworkforce/utils.
 *
 * @module errors
 */

export {
  ErrorCode,
  AppError,
  createError,
  isAppError,
  toAppError,
  getErrorMessage,
} from '@agiworkforce/utils';

export type { ApiError, ErrorCodeValue, FriendlyError } from '@agiworkforce/utils';
