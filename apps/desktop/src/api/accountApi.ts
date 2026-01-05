import {
  CreditBalanceResponse,
  DeductCreditsResponse,
  DeviceLinkResponse,
  TokenResponse,
  UserProfile,
} from '../types/account';

// Check if running in Tauri environment
const isTauri = !!(window as any).__TAURI_INTERNALS__;

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
    return invoke('device_link_initiate');
  },

  deviceLinkPoll: async (deviceCode: string): Promise<TokenResponse> => {
    const invoke = await getInvoke();
    return invoke('device_link_poll', { deviceCode });
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
    return invoke('fetch_user_profile', { accessToken });
  },

  oauthRefresh: async (refreshToken: string): Promise<TokenResponse> => {
    const invoke = await getInvoke();
    return invoke('oauth_refresh', { refreshToken });
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
    return invoke('fetch_credit_balance');
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
    return invoke('report_llm_usage', {
      amount_cents: amountCents,
      model,
      provider,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    });
  },
};
