import { PROFILE_FETCH_TIMEOUT_MS } from '../constants/timeouts';
import type { UserProfile } from '../types/account';
import { invoke, isTauri } from '../lib/tauri-mock';

export class ApiTimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`API request '${operation}' timed out after ${timeoutMs}ms`);
    this.name = 'ApiTimeoutError';
  }
}

const withTimeout = <T>(
  promise: Promise<T>,
  operationName: string,
  timeoutMs: number,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ApiTimeoutError(operationName, timeoutMs)), timeoutMs);
  });
  return Promise.race([promise, deadline]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
};

export const accountApi = {
  fetchUserProfile: async (accessToken: string): Promise<UserProfile> => {
    if (!isTauri) {
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
