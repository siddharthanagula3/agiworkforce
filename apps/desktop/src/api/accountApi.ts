import { PROFILE_FETCH_TIMEOUT_MS } from '../constants/timeouts';
import type { UserProfile } from '../types/account';
import { invoke, isTauri } from '../lib/tauri-mock';

// Timeout error class for better error handling
export class ApiTimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`API request '${operation}' timed out after ${timeoutMs}ms`);
    this.name = 'ApiTimeoutError';
  }
}

/**
 * Wraps a promise with a total-request deadline that rejects if the command has
 * not settled in time. This is a whole-call deadline, not a connect or
 * first-byte one: `invoke` surfaces a single settled promise, so there is no
 * earlier phase to time separately here.
 */
const withTimeout = <T>(
  promise: Promise<T>,
  operationName: string,
  timeoutMs: number,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ApiTimeoutError(operationName, timeoutMs)), timeoutMs);
  });
  // The deadline timer is released as soon as the command settles. It cannot
  // cancel the Rust-side work — `invoke` exposes no abort handle — so a late
  // reply is still computed, it is simply no longer awaited.
  return Promise.race([promise, deadline]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
};

export const accountApi = {
  fetchUserProfile: async (accessToken: string): Promise<UserProfile> => {
    if (!isTauri) {
      // In web mode, return an empty profile. Subscription data is owned by the web API.
      return {
        id: '',
        email: '',
        credits: null,
      };
    }
    return withTimeout(
      invoke<UserProfile>('fetch_user_profile', { accessToken }),
      'fetch_user_profile',
      PROFILE_FETCH_TIMEOUT_MS,
    );
  },
};
