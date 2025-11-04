import { apiClient } from './api';

export interface RegisterMobilePayload {
  name: string;
  platform: string;
  pushToken?: string;
  clientId?: string;
}

export interface PushTokenPayload {
  deviceId: string;
  pushToken: string;
}

export const mobileService = {
  register(token: string, payload: RegisterMobilePayload) {
    return apiClient.post<{ deviceId: string }, RegisterMobilePayload>(
      '/api/mobile/register',
      payload,
      token,
    );
  },
  updatePushToken(token: string, payload: PushTokenPayload) {
    return apiClient.post<{ success: boolean }, PushTokenPayload>(
      '/api/mobile/push-token',
      payload,
      token,
    );
  },
  list(token: string) {
    return apiClient.get<{
      devices: Array<{
        id: string;
        name: string;
        platform: string;
        pushToken?: string;
        updatedAt: number;
      }>;
    }>('/api/mobile', token);
  },
};
