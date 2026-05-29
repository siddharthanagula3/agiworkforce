/**
 * Realtime Service (no-op stub)
 *
 * Realtime subscriptions have been removed. All methods are retained
 * as no-op stubs so that call sites continue to compile. Real-time features
 * will be re-implemented with a different provider or polling approach.
 */

import { logger } from '@shared/lib/logger';

// =============================================
// TYPES
// =============================================

type Unsubscribe = () => void;

export interface RealtimeCallbacks {
  onJobUpdate?: (job: unknown) => void;
  onJobCreated?: (job: unknown) => void;
  onJobDeleted?: (jobId: string) => void;
  onAgentUpdate?: (agent: unknown) => void;
  onNotification?: (notification: unknown) => void;
  onError?: (error: string) => void;
}

export interface ConnectionStatus {
  connected: boolean;
  channels: string[];
  lastError?: string;
}

export interface RealtimeService {
  connect: () => void;
  disconnect: () => void;
  subscribe: (channel: string, handler: (...args: unknown[]) => void) => Unsubscribe;
  publish: (channel: string, payload: unknown) => void;
  // Extended API for useRealtime hook
  initializeRealtime: (userId: string, callbacks: RealtimeCallbacks) => Promise<void>;
  cleanup: () => Promise<void>;
  getConnectionStatus: () => ConnectionStatus;
  reconnect: (userId: string) => Promise<void>;
}

// =============================================
// IMPLEMENTATION
// =============================================

class RealtimeServiceImpl implements RealtimeService {
  private connectionState: ConnectionStatus = {
    connected: false,
    channels: [],
  };

  /**
   * Connect to the realtime service (no-op stub)
   */
  connect(): void {
    logger.warn('[RealtimeService] connect() called but Realtime has been removed.');
  }

  /**
   * Disconnect from all channels (no-op stub)
   */
  disconnect(): void {
    this.connectionState.connected = false;
    this.connectionState.channels = [];
    logger.warn('[RealtimeService] disconnect() called but Realtime has been removed.');
  }

  /**
   * Subscribe to a channel (no-op stub)
   */
  subscribe(channelName: string, _handler: (...args: unknown[]) => void): Unsubscribe {
    logger.warn(
      `[RealtimeService] subscribe(${channelName}) called but Realtime has been removed. No subscription created.`,
    );
    return () => {};
  }

  /**
   * Publish a message to a channel (no-op stub)
   */
  publish(channelName: string, _payload: unknown): void {
    logger.warn(
      `[RealtimeService] publish(${channelName}) called but Realtime has been removed. No message sent.`,
    );
  }

  /**
   * Initialize realtime subscriptions for a user (no-op stub)
   */
  async initializeRealtime(userId: string, _callbacks: RealtimeCallbacks): Promise<void> {
    logger.warn(
      `[RealtimeService] initializeRealtime(${userId}) called but Realtime has been removed.`,
    );
  }

  /**
   * Clean up all subscriptions (no-op stub)
   */
  async cleanup(): Promise<void> {
    this.connectionState = { connected: false, channels: [] };
    logger.warn('[RealtimeService] cleanup() called but Realtime has been removed.');
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionState };
  }

  /**
   * Reconnect all subscriptions for a user (no-op stub)
   */
  async reconnect(userId: string): Promise<void> {
    logger.warn(`[RealtimeService] reconnect(${userId}) called but Realtime has been removed.`);
  }
}

// =============================================
// SINGLETON EXPORT
// =============================================

export const realtimeService: RealtimeService = new RealtimeServiceImpl();
