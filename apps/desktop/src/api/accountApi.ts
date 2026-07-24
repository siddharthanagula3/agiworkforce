import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import type { UserProfile } from '../types/account';
import { isTauri } from '../lib/tauri-mock';

// Default timeout for API requests (30 seconds)
const DEFAULT_TIMEOUT_MS = 30_000;

// Timeout error class for better error handling
export class ApiTimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`API request '${operation}' timed out after ${timeoutMs}ms`);
    this.name = 'ApiTimeoutError';
  }
}

/**
 * Wraps a promise with a timeout that rejects if the operation takes too long.
 */
const withTimeout = <T>(
  promise: Promise<T>,
  operationName: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new ApiTimeoutError(operationName, timeoutMs)), timeoutMs),
    ),
  ]);
};

const getInvoke = async () => {
  if (!isTauri) {
    throw new Error('Tauri is not available in web development mode');
  }
  return tauriInvoke;
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
    const invoke = await getInvoke();
    return withTimeout(invoke('fetch_user_profile', { accessToken }), 'fetch_user_profile');
  },
};
