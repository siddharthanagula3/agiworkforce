import { invoke } from '@tauri-apps/api/core';
import { DeviceLinkResponse, TokenResponse, UserProfile } from '../types/account';

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
};
