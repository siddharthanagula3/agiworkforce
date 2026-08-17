import { command } from '@agiworkforce/client-runtime';

export interface RealtimeConnectionInfo {
  url: string;
  token: string;
}
export interface UserPresence {
  userId: string;
  status: string;
  lastSeen: string;
}
export interface UserActivity {
  type: string;
  description?: string;
  timestamp: string;
}

export interface PairRequestPrompt {
  requestId: string;
  extensionId: string;
  code: string;
  expiresInMs: number;
}

export const BRIDGE_PAIR_REQUEST_EVENT = 'bridge:pair-request';
export const BRIDGE_PAIR_REQUEST_CONFIRMED_EVENT = 'bridge:pair-request-confirmed';

export async function bridgePendingPairRequests(): Promise<PairRequestPrompt[]> {
  return command<PairRequestPrompt[]>('bridge_pending_pair_requests');
}
export async function bridgeDenyPairRequest(requestId: string): Promise<boolean> {
  return command<boolean>('bridge_deny_pair_request', { requestId });
}

export async function connectWebsocket(
  userId: string,
  teamId?: string,
): Promise<RealtimeConnectionInfo> {
  return command<RealtimeConnectionInfo>('connect_websocket', { userId, teamId });
}
export async function getTeamPresence(teamId: string): Promise<UserPresence[]> {
  return command<UserPresence[]>('get_team_presence', { teamId });
}
export async function updateUserActivity(userId: string, activity: UserActivity): Promise<void> {
  return command<void>('update_user_activity', { userId, activity });
}
export async function setUserOnline(userId: string): Promise<void> {
  return command<void>('set_user_online', { userId });
}
export async function setUserOffline(userId: string): Promise<void> {
  return command<void>('set_user_offline', { userId });
}
export async function getUserPresence(userId: string): Promise<UserPresence | null> {
  return command<UserPresence | null>('get_user_presence', { userId });
}
