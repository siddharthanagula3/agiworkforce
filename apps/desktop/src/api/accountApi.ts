import {
  CreditBalanceResponse,
  DeductCreditsResponse,
  DeviceLinkResponse,
  TokenResponse,
  UserProfile,
} from '../types/account';

// Check if running in Tauri environment
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

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

// Dynamic import of invoke to handle web development mode
const getInvoke = async () => {
  if (!isTauri) {
    throw new Error('Tauri is not available in web development mode');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke;
};

export const accountApi = {
  deviceLinkInitiate: async (): Promise<DeviceLinkResponse> => {
    const invoke = await getInvoke();
    return withTimeout(invoke('device_link_initiate'), 'device_link_initiate');
  },

  deviceLinkPoll: async (deviceCode: string): Promise<TokenResponse> => {
    const invoke = await getInvoke();
    // Longer timeout for polling (60s) since user needs time to authorize
    // Note: Rust expects 'device_id' field name
    return withTimeout(
      invoke('device_link_poll', { device_id: deviceCode }),
      'device_link_poll',
      60_000,
    );
  },

  fetchUserProfile: async (accessToken: string): Promise<UserProfile> => {
    if (!isTauri) {
      // In web mode, return empty profile - subscription data comes from Supabase
      return {
        id: '',
        email: '',
        credits: null,
      };
    }
    const invoke = await getInvoke();
    return withTimeout(invoke('fetch_user_profile', { accessToken }), 'fetch_user_profile');
  },

  oauthRefresh: async (refreshToken: string): Promise<TokenResponse> => {
    const invoke = await getInvoke();
    return withTimeout(invoke('oauth_refresh', { refreshToken }), 'oauth_refresh');
  },

  /** Fetch current credit balance from the API Gateway */
  fetchCreditBalance: async (): Promise<CreditBalanceResponse> => {
    if (!isTauri) {
      // In web mode, return empty credits
      return {
        has_credits: false,
        account_id: null,
        credits_allocated_cents: 0,
        credits_used_cents: 0,
        credits_remaining_cents: 0,
        daily_limit_cents: 0,
        daily_used_cents: 0,
        daily_remaining_cents: 0,
        period_start: null,
        period_end: null,
      };
    }
    const invoke = await getInvoke();
    return withTimeout(invoke('fetch_credit_balance'), 'fetch_credit_balance');
  },

  /** Report LLM usage to deduct credits */
  reportLlmUsage: async (
    amountCents: number,
    model: string,
    provider: string,
    inputTokens?: number,
    outputTokens?: number,
  ): Promise<DeductCreditsResponse> => {
    if (!isTauri) {
      // In web mode, skip reporting
      return { success: false, error: 'Not available in web mode' };
    }
    const invoke = await getInvoke();
    return withTimeout(
      invoke('report_llm_usage', {
        amount_cents: amountCents,
        model,
        provider,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      }),
      'report_llm_usage',
    );
  },
};
