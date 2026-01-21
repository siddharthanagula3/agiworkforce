/**
 * Auth Store (Legacy - Re-exports from unified auth store)
 *
 * This file is kept for backwards compatibility.
 * All functionality has been consolidated into ./auth.ts
 *
 * @deprecated Import from './auth' instead
 */

export {
  // Store hook
  useAuthStore,
  // Initialization
  initializeAuthStore,
  // Selectors
  selectIsAuthReady,
  selectUser,
  selectIsAuthenticated,
  selectIsLoading,
  selectAuthError,
  // Helpers
  waitForAuthReady,
  // Types
  type User,
} from './auth';
