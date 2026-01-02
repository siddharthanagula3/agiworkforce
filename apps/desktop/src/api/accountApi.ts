import { invoke } from '@tauri-apps/api/core';
import {
  CreditBalanceResponse,
  DeductCreditsResponse,
  DeviceLinkResponse,
  TokenResponse,
  UserProfile,
} from '../types/account';

export const accountApi = {
  deviceLinkInitiate: async (): Promise<DeviceLinkResponse> => {
    return invoke('device_link_initiate');
  },

  deviceLinkPoll: async (deviceCode: string): Promise<TokenResponse> => {
    return invoke('device_link_poll', { deviceCode });
  },

  fetchUserProfile: async (accessToken: string): Promise<UserProfile> => {
    return invoke('fetch_user_profile', { accessToken });
  },

  oauthRefresh: async (refreshToken: string): Promise<TokenResponse> => {
    return invoke('oauth_refresh', { refreshToken });
  },

  /** Fetch current credit balance from the API Gateway */
  fetchCreditBalance: async (): Promise<CreditBalanceResponse> => {
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
    return invoke('report_llm_usage', {
      amount_cents: amountCents,
      model,
      provider,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    });
  },
};
