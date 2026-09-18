import type { WebSocket } from 'ws';
import { logger } from './logger.js';
import {
  MAX_CONNECTIONS_PER_IP,
  CLOSE_ALL_TIMEOUT_MS,
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

interface RemoveConnectionMetadata {
  trigger?: 'socket_close' | 'server_cleanup' | 'server_shutdown' | 'error';
  closeCode?: number;
  closeReason?: string;
}

class ConnectionManager {
  private connections = new Map<WebSocket, ConnectionInfo>();
  private ipConnectionCounts = new Map<string, number>();
  private closeReasonCounts = new Map<string, number>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleConnections();
    }, STALE_CONNECTION_CHECK_INTERVAL_MS);

    logger.info('Connection manager started');
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    logger.info('Connection manager stopped');
  }

  canConnect(ip: string): boolean {
    const currentCount = this.ipConnectionCounts.get(ip) ?? 0;
    return currentCount < MAX_CONNECTIONS_PER_IP;
  }

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

  removeConnection(socket: WebSocket, metadata: RemoveConnectionMetadata = {}): void {
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

    const idleDuration = Date.now() - info.lastActivity;
    const closeReasonKey = metadata.closeReason || `code_${metadata.closeCode ?? 'unknown'}`;
    const currentCloseReasonCount = this.closeReasonCounts.get(closeReasonKey) ?? 0;
    this.closeReasonCounts.set(closeReasonKey, currentCloseReasonCount + 1);

    logger.debug(
      {
        ip: info.ip,
        correlationId: info.correlationId,
        totalConnections: this.connections.size,
        connectionDuration: Date.now() - info.connectedAt,
        idleDuration,
        trigger: metadata.trigger ?? 'socket_close',
        closeCode: metadata.closeCode,
        closeReason: metadata.closeReason,
      },
      'Connection removed',
    );
  }

  updateActivity(socket: WebSocket): void {
    const info = this.connections.get(socket);
    if (info) {
      info.lastActivity = Date.now();
    }
  }

  getCorrelationId(socket: WebSocket): string | undefined {
    return this.connections.get(socket)?.correlationId;
  }

  getIp(socket: WebSocket): string | undefined {
    return this.connections.get(socket)?.ip;
  }

  getStats(): {
    totalConnections: number;
    uniqueIps: number;
    connectionsByIp: Map<string, number>;
    closeReasons: Map<string, number>;
  } {
    return {
      totalConnections: this.connections.size,
      uniqueIps: this.ipConnectionCounts.size,
      connectionsByIp: new Map(this.ipConnectionCounts),
      closeReasons: new Map(this.closeReasonCounts),
    };
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * A shutdown that leaves its bookkeeping behind rejects the same client when
   * it reconnects: the per-IP count still holds the socket that the restart
   * closed, and no 'close' event is coming for a process that is going away.
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
      let settled = false;
      const timer = setTimeout(() => {
        settled = true;
        resolve();
      }, CLOSE_ALL_TIMEOUT_MS);
      const checkDone = () => {
        closed++;
        if (closed >= sockets.length && !settled) {
          settled = true;
          clearTimeout(timer);
          resolve();
        }
      };

      for (const socket of sockets) {
        try {
          if (socket.readyState === 1) {
            socket.send(JSON.stringify({ type: 'server_shutdown', reason }));
          }
          socket.close(1001, reason);
        } catch {
          // A socket that cannot be closed is still gone with this process.
        } finally {
          this.removeConnection(socket, { trigger: 'server_shutdown', closeReason: reason });
          checkDone();
        }
      }
    });
  }

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

export const connectionManager = new ConnectionManager();
