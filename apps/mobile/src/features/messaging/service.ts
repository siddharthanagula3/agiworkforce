import { api } from '@/services/api';
import { FEATURES } from '@/lib/v1FeatureFlags';

export interface MessagingConfigResponse {
  connections: Array<{
    id: string;
    platform: string;
    config: Record<string, string>;
    is_active: boolean;
    connected_at: string;
    updated_at: string;
  }>;
}

export interface MessagingStatsResponse {
  messagesSent: number;
  messagesReceived: number;
  lastActive: string | null;
}

export interface TestConnectionResponse {
  success: boolean;
  error?: string;
}

function assertMessagingAvailable(): void {
  if (!FEATURES.messaging) {
    throw new Error('messaging: not available in v1');
  }
}

/**
 * Fetch all messaging platform connections for the authenticated user.
 */
export function getMessagingConfig(): Promise<MessagingConfigResponse> {
  assertMessagingAvailable();
  return api.get<MessagingConfigResponse>('/api/messaging/config');
}

/**
 * Connect (create or update) a messaging platform.
 */
export function connectMessagingPlatform(
  platform: string,
  config: Record<string, string>,
): Promise<{ connection: Record<string, unknown> }> {
  assertMessagingAvailable();
  return api.post<{ connection: Record<string, unknown> }>('/api/messaging/config', {
    platform,
    config,
  });
}

/**
 * Disconnect (remove) a messaging platform connection.
 */
export function disconnectMessagingPlatform(platform: string): Promise<{ success: boolean }> {
  assertMessagingAvailable();
  return api.delete<{ success: boolean }>(`/api/messaging/config/${platform}`);
}

/**
 * Get message statistics for a specific platform.
 */
export function getMessagingStats(platform: string): Promise<MessagingStatsResponse> {
  assertMessagingAvailable();
  return api.get<MessagingStatsResponse>(`/api/messaging/stats/${platform}`);
}

/**
 * Test a messaging platform connection before saving.
 */
export function testConnection(
  platform: string,
  config: Record<string, string>,
): Promise<TestConnectionResponse> {
  assertMessagingAvailable();
  return api.post<TestConnectionResponse>(`/api/messaging/test/${platform}`, {
    platform,
    config,
  });
}
