/**
 * Standardized error types and utilities for API routes
 *
 * This module re-exports error utilities from @agiworkforce/utils for
 * consistency across the codebase. New code should prefer importing
 * directly from @agiworkforce/utils.
 *
 * @module errors
 */

// Re-export everything from the shared utils package
// This maintains backwards compatibility while centralizing error handling
export {
  ErrorCode,
  AppError,
  createError,
  isAppError,
  toAppError,
  getErrorMessage,
} from '@agiworkforce/utils';

// Type-only exports
export type { ApiError, ErrorCodeValue, FriendlyError } from '@agiworkforce/utils';
