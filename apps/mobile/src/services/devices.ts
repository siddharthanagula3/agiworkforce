import { apiClient } from './api';

export interface DesktopSummary {
  id: string;
  name: string;
  platform: string;
  version: string;
  online: boolean;
  lastSeen: number;
}

export type CommandType = 'chat' | 'automation' | 'query';

export interface CommandPayload {
  type: CommandType;
  payload: Record<string, unknown>;
}

export const deviceService = {
  list(token: string) {
    return apiClient.get<{ desktops: DesktopSummary[] }>('/api/desktop', token);
  },
  sendCommand(token: string, desktopId: string, payload: CommandPayload) {
    return apiClient.post<{ commandId: string; status: string }>(
      `/api/desktop/${desktopId}/command`,
      payload,
      token,
    );
  },
  status(token: string, desktopId: string) {
    return apiClient.get<Omit<DesktopSummary, 'online'> & { online: boolean }>(
      `/api/desktop/${desktopId}/status`,
      token,
    );
  },
};
