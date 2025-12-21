import { invoke } from '@tauri-apps/api/core';
import { DeviceLinkResponse, TokenResponse, UserProfile } from '../types/account';

export const accountApi = {
  /**
   * Initiate the device link flow (OAuth 2.0 Device Authorization Grant)
   */
  deviceLinkInitiate: async (): Promise<DeviceLinkResponse> => {
    return invoke('device_link_initiate');
  },

  /**
   * Poll for the token after user authorizes the device
   */
  deviceLinkPoll: async (deviceCode: string): Promise<TokenResponse> => {
    return invoke('device_link_poll', { deviceCode });
  },

  /**
   * Fetch user profile using the access token
   */
  fetchUserProfile: async (accessToken: string): Promise<UserProfile> => {
    return invoke('fetch_user_profile', { accessToken });
  },

  /**
   * Refresh the access token using a refresh token
   */
  oauthRefresh: async (refreshToken: string): Promise<TokenResponse> => {
    return invoke('oauth_refresh', { refreshToken });
  },
};
