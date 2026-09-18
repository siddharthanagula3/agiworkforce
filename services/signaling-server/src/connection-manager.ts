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
  deviceId?: string;
}

interface RemoveConnectionMetadata {
  trigger?: 'socket_close' | 'server_cleanup' | 'server_shutdown' | 'error' | 'device_revoked';
  closeCode?: number;
  closeReason?: string;
}

export const DEVICE_REVOKED_CLOSE_CODE = 1008;
export const DEVICE_REVOKED_REASON = 'device_revoked';

class ConnectionManager {
  private connections = new Map<WebSocket, ConnectionInfo>();
  private ipConnectionCounts = new Map<string, number>();
  private closeReasonCounts = new Map<string, number>();
  private deviceSockets = new Map<string, Set<WebSocket>>();
  private revokedDevices = new Set<string>();
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
    this.forgetDeviceSocket(socket, info.deviceId);

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

  /**
   * Names the device behind an already-open socket, which is the earliest the
   * server knows it: the identity arrives in the register message, not in the
   * handshake. Returns false when the device is already revoked, so the caller
   * refuses the registration instead of relaying for it.
   */
  bindDevice(socket: WebSocket, deviceId: string): boolean {
    const info = this.connections.get(socket);
    if (!info || !deviceId) return false;
    if (this.revokedDevices.has(deviceId)) {
      this.closeRevoked(socket, DEVICE_REVOKED_REASON);
      return false;
    }

    this.forgetDeviceSocket(socket, info.deviceId);
    info.deviceId = deviceId;
    const sockets = this.deviceSockets.get(deviceId) ?? new Set<WebSocket>();
    sockets.add(socket);
    this.deviceSockets.set(deviceId, sockets);
    return true;
  }

  /**
   * Drops every connection a revoked device holds, now. The device id is also
   * remembered so a reconnect that arrives a moment later is refused rather
   * than waiting for the next poll of whatever revoked it.
   */
  revokeDevice(deviceId: string, reason: string = DEVICE_REVOKED_REASON): number {
    if (!deviceId) return 0;
    this.revokedDevices.add(deviceId);

    const sockets = this.deviceSockets.get(deviceId);
    if (!sockets || sockets.size === 0) {
      logger.info({ deviceId, closed: 0 }, 'Device revoked with no live connections');
      return 0;
    }

    let closed = 0;
    for (const socket of [...sockets]) {
      this.closeRevoked(socket, reason);
      this.removeConnection(socket, {
        trigger: 'device_revoked',
        closeCode: DEVICE_REVOKED_CLOSE_CODE,
        closeReason: reason,
      });
      closed++;
    }
    this.deviceSockets.delete(deviceId);

    logger.info({ deviceId, closed, reason }, 'Device revoked; connections dropped');
    return closed;
  }

  /** Undoes a revocation when the device is paired again. */
  reinstateDevice(deviceId: string): void {
    this.revokedDevices.delete(deviceId);
  }

  isDeviceRevoked(deviceId: string): boolean {
    return this.revokedDevices.has(deviceId);
  }

  getDeviceConnectionCount(deviceId: string): number {
    return this.deviceSockets.get(deviceId)?.size ?? 0;
  }

  private closeRevoked(socket: WebSocket, reason: string): void {
    try {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify({ type: DEVICE_REVOKED_REASON, reason }));
      }
      socket.close(DEVICE_REVOKED_CLOSE_CODE, reason);
    } catch {
      // A socket that cannot be closed is already gone; the binding is dropped either way.
    }
  }

  private forgetDeviceSocket(socket: WebSocket, deviceId: string | undefined): void {
    if (!deviceId) return;
    const sockets = this.deviceSockets.get(deviceId);
    if (!sockets) return;
    sockets.delete(socket);
    if (sockets.size === 0) this.deviceSockets.delete(deviceId);
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
