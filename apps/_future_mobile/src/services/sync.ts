import { apiClient } from './api';

export interface SyncPayload {
  type: string;
  data: Record<string, unknown>;
  deviceId: string;
}

export interface SyncRecord extends SyncPayload {
  userId: string;
  timestamp: number;
}

export const syncService = {
  push(token: string, payload: SyncPayload) {
    return apiClient.post<{ success: boolean; timestamp: number }, SyncPayload>(
      '/api/sync/push',
      payload,
      token,
    );
  },
  pull(token: string, since: number, deviceId?: string) {
    const query = new URLSearchParams();
    if (since > 0) {
      query.set('since', since.toString());
    }
    if (deviceId) {
      query.set('deviceId', deviceId);
    }
    return apiClient.get<{ data: SyncRecord[]; timestamp: number }>(
      `/api/sync/pull?${query.toString()}`,
      token,
    );
  },
  clear(token: string) {
    return apiClient.delete<{ success: boolean }>('/api/sync/clear', token);
  },
};
