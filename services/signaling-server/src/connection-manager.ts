/**
 * Connection management for WebSocket server
 *
 * Features:
 * - Track active connections count
 * - Per-IP connection limits
 * - Idle connection timeout
 * - Periodic stale session cleanup
 */

import type { WebSocket } from 'ws';
import { logger } from './logger.js';
import {
  MAX_CONNECTIONS_PER_IP,
  CONNECTION_IDLE_TIMEOUT_MS,
  STALE_CONNECTION_CHECK_INTERVAL_MS,
} from './constants.js';

interface ConnectionInfo {
  socket: WebSocket;
  ip: string;
  connectedAt: number;
  lastActivity: number;
  correlationId: string;
}

class ConnectionManager {
  private connections = new Map<WebSocket, ConnectionInfo>();
  private ipConnectionCounts = new Map<string, number>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Start the connection manager cleanup interval
   */
  start(): void {
    if (this.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleConnections();
    }, STALE_CONNECTION_CHECK_INTERVAL_MS);

    logger.info('Connection manager started');
  }

  /**
   * Stop the connection manager cleanup interval
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    logger.info('Connection manager stopped');
  }

  /**
   * Check if a new connection from this IP is allowed
   */
  canConnect(ip: string): boolean {
    const currentCount = this.ipConnectionCounts.get(ip) ?? 0;
    return currentCount < MAX_CONNECTIONS_PER_IP;
  }

  /**
   * Register a new connection
   */
  addConnection(socket: WebSocket, ip: string, correlationId: string): void {
    const now = Date.now();
    const info: ConnectionInfo = {
      socket,
      ip,
      connectedAt: now,
      lastActivity: now,
      correlationId,
    };

    this.connections.set(socket, info);

    const currentCount = this.ipConnectionCounts.get(ip) ?? 0;
    this.ipConnectionCounts.set(ip, currentCount + 1);

    logger.debug(
      {
        ip,
        correlationId,
        totalConnections: this.connections.size,
        ipConnections: currentCount + 1,
      },
      'Connection added',
    );
  }

  /**
   * Remove a connection
   */
  removeConnection(socket: WebSocket): void {
    const info = this.connections.get(socket);
    if (!info) {
      return;
    }

    this.connections.delete(socket);

    const currentCount = this.ipConnectionCounts.get(info.ip) ?? 1;
    if (currentCount <= 1) {
      this.ipConnectionCounts.delete(info.ip);
    } else {
      this.ipConnectionCounts.set(info.ip, currentCount - 1);
    }

    logger.debug(
      {
        ip: info.ip,
        correlationId: info.correlationId,
        totalConnections: this.connections.size,
        connectionDuration: Date.now() - info.connectedAt,
      },
      'Connection removed',
    );
  }

  /**
   * Update last activity timestamp for a connection
   */
  updateActivity(socket: WebSocket): void {
    const info = this.connections.get(socket);
    if (info) {
      info.lastActivity = Date.now();
    }
  }

  /**
   * Get the correlation ID for a connection
   */
  getCorrelationId(socket: WebSocket): string | undefined {
    return this.connections.get(socket)?.correlationId;
  }

  /**
   * Get the IP address for a connection
   */
  getIp(socket: WebSocket): string | undefined {
    return this.connections.get(socket)?.ip;
  }

  /**
   * Get current connection statistics
   */
  getStats(): {
    totalConnections: number;
    uniqueIps: number;
    connectionsByIp: Map<string, number>;
  } {
    return {
      totalConnections: this.connections.size,
      uniqueIps: this.ipConnectionCounts.size,
      connectionsByIp: new Map(this.ipConnectionCounts),
    };
  }

  /**
   * Get total active connections
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Close all connections gracefully
   */
  closeAllConnections(reason: string = 'server_shutdown'): Promise<void> {
    return new Promise((resolve) => {
      const sockets = Array.from(this.connections.keys());

      if (sockets.length === 0) {
        resolve();
        return;
      }

      logger.info({ count: sockets.length }, 'Closing all connections');

      let closed = 0;
      const checkDone = () => {
        closed++;
        if (closed >= sockets.length) {
          resolve();
        }
      };

      for (const socket of sockets) {
        try {
          // Send shutdown message before closing
          if (socket.readyState === 1) {
            // WebSocket.OPEN
            socket.send(JSON.stringify({ type: 'server_shutdown', reason }));
          }
          socket.close(1001, reason);
          checkDone();
        } catch {
          checkDone();
        }
      }

      // Safety timeout
      setTimeout(resolve, 5000);
    });
  }

  /**
   * Clean up idle connections
   */
  private cleanupIdleConnections(): void {
    const now = Date.now();
    let closedCount = 0;

    for (const [socket, info] of this.connections.entries()) {
      const idleTime = now - info.lastActivity;
      if (idleTime > CONNECTION_IDLE_TIMEOUT_MS) {
        logger.debug(
          {
            ip: info.ip,
            correlationId: info.correlationId,
            idleTime,
          },
          'Closing idle connection',
        );

        try {
          if (socket.readyState === 1) {
            // WebSocket.OPEN
            socket.send(JSON.stringify({ type: 'connection_timeout', reason: 'idle' }));
          }
          socket.close(1000, 'idle_timeout');
          closedCount++;
        } catch (error) {
          logger.warn({ error }, 'Error closing idle connection');
        }
      }
    }

    if (closedCount > 0) {
      logger.info({ closedCount }, 'Cleaned up idle connections');
    }
  }
}

// Export singleton instance
export const connectionManager = new ConnectionManager();
