/**
 * WebSocket Manager (no-op stub)
 *
 * Realtime channel management has been removed. The class, enums,
 * and interfaces are retained so that call sites continue to compile. Native
 * WebSocket and Realtime functionality will be re-implemented with a
 * different provider.
 */

import { logger } from '@shared/lib/logger';

// WebSocket connection states
export enum WebSocketState {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTING = 'DISCONNECTING',
  DISCONNECTED = 'DISCONNECTED',
  RECONNECTING = 'RECONNECTING',
  FAILED = 'FAILED',
}

// Message types
export enum MessageType {
  CHAT = 'CHAT',
  TYPING = 'TYPING',
  PRESENCE = 'PRESENCE',
  CURSOR = 'CURSOR',
  ACTIVITY = 'ACTIVITY',
  DELIVERY = 'DELIVERY',
  READ_RECEIPT = 'READ_RECEIPT',
  SYSTEM = 'SYSTEM',
  HEARTBEAT = 'HEARTBEAT',
}

// WebSocket message structure
export interface WebSocketMessage {
  id: string;
  type: MessageType;
  payload: unknown;
  timestamp: number;
  sessionId?: string;
  userId?: string;
  agentId?: string;
  priority?: 'high' | 'normal' | 'low';
}

// Connection configuration
export interface ConnectionConfig {
  url?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  messageQueueSize?: number;
  poolSize?: number;
  useNeonRealtime?: boolean;
}

// Connection metrics
export interface ConnectionMetrics {
  connectionId: string;
  state: WebSocketState;
  connectedAt?: number;
  disconnectedAt?: number;
  reconnectAttempts: number;
  messagesReceived: number;
  messagesSent: number;
  latency: number;
  errors: number;
  lastHeartbeat?: number;
}

// Event types
export type WebSocketEventType =
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'message'
  | 'error'
  | 'stateChange';

export interface WebSocketEvent {
  type: WebSocketEventType;
  connectionId: string;
  data?: unknown;
  timestamp: number;
}

export class WebSocketManager {
  constructor(_config: ConnectionConfig = {}) {
    logger.warn('[WebSocketManager] Realtime has been removed. Manager is a no-op stub.');
  }

  /**
   * Create a new WebSocket connection (no-op stub)
   */
  async connect(_connectionId: string, _sessionId?: string): Promise<void> {
    logger.warn('[WebSocketManager] connect() called but realtime has been removed.');
  }

  /**
   * Disconnect a WebSocket connection (no-op stub)
   */
  async disconnect(_connectionId: string): Promise<void> {
    logger.warn('[WebSocketManager] disconnect() called but realtime has been removed.');
  }

  /**
   * Send a message through WebSocket (no-op stub)
   */
  async send(
    _connectionId: string,
    _message: Omit<WebSocketMessage, 'id' | 'timestamp'>,
  ): Promise<void> {
    logger.warn('[WebSocketManager] send() called but realtime has been removed.');
  }

  /**
   * Broadcast a message to all connections (no-op stub)
   */
  async broadcast(_message: Omit<WebSocketMessage, 'id' | 'timestamp'>): Promise<void> {
    logger.warn('[WebSocketManager] broadcast() called but realtime has been removed.');
  }

  /**
   * Register message handler for specific message type (no-op stub)
   */
  onMessage(_type: MessageType, _handler: (message: WebSocketMessage) => void): () => void {
    logger.warn('[WebSocketManager] onMessage() called but realtime has been removed.');
    return () => {};
  }

  /**
   * Register event listener (no-op stub)
   */
  on(
    _connectionId: string,
    _event: WebSocketEventType,
    _handler: (event: WebSocketEvent) => void,
  ): () => void {
    logger.warn('[WebSocketManager] on() called but realtime has been removed.');
    return () => {};
  }

  /**
   * Register global event listener (no-op stub)
   */
  onGlobal(_event: WebSocketEventType, _handler: (event: WebSocketEvent) => void): () => void {
    logger.warn('[WebSocketManager] onGlobal() called but realtime has been removed.');
    return () => {};
  }

  /**
   * Get connection state (no-op stub)
   */
  getState(_connectionId: string): WebSocketState | undefined {
    return undefined;
  }

  /**
   * Get connection metrics (no-op stub)
   */
  getMetrics(_connectionId: string): ConnectionMetrics | undefined {
    return undefined;
  }

  /**
   * Get all connections (no-op stub)
   */
  getAllConnections(): string[] {
    return [];
  }

  /**
   * Get connection count (no-op stub)
   */
  getConnectionCount(): number {
    return 0;
  }

  /**
   * Check if connection is active (no-op stub)
   */
  isConnected(_connectionId: string): boolean {
    return false;
  }

  /**
   * Clean up all connections (no-op stub)
   */
  async cleanup(): Promise<void> {
    logger.warn('[WebSocketManager] cleanup() called but realtime has been removed.');
  }
}

// Singleton instance
export const websocketManager = new WebSocketManager();
