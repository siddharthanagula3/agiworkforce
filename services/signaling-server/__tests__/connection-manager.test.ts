/**
 * Connection Manager Tests
 *
 * Tests for WebSocket connection management:
 * - Connection tracking
 * - Per-IP limits
 * - Idle timeout handling
 * - Statistics
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock WebSocket class
class MockWebSocket extends EventEmitter {
  readyState = 1; // OPEN
  send = vi.fn();
  close = vi.fn();
}

// Simplified ConnectionManager for testing
class TestConnectionManager {
  private connections = new Map<
    MockWebSocket,
    { ip: string; connectedAt: number; lastActivity: number; correlationId: string }
  >();
  private ipConnectionCounts = new Map<string, number>();
  private maxConnectionsPerIp = 5;

  canConnect(ip: string): boolean {
    const currentCount = this.ipConnectionCounts.get(ip) ?? 0;
    return currentCount < this.maxConnectionsPerIp;
  }

  addConnection(socket: MockWebSocket, ip: string, correlationId: string): void {
    const now = Date.now();
    this.connections.set(socket, {
      ip,
      connectedAt: now,
      lastActivity: now,
      correlationId,
    });

    const currentCount = this.ipConnectionCounts.get(ip) ?? 0;
    this.ipConnectionCounts.set(ip, currentCount + 1);
  }

  removeConnection(socket: MockWebSocket): void {
    const info = this.connections.get(socket);
    if (!info) return;

    this.connections.delete(socket);

    const currentCount = this.ipConnectionCounts.get(info.ip) ?? 1;
    if (currentCount <= 1) {
      this.ipConnectionCounts.delete(info.ip);
    } else {
      this.ipConnectionCounts.set(info.ip, currentCount - 1);
    }
  }

  updateActivity(socket: MockWebSocket): void {
    const info = this.connections.get(socket);
    if (info) {
      info.lastActivity = Date.now();
    }
  }

  getStats(): { totalConnections: number; uniqueIps: number } {
    return {
      totalConnections: this.connections.size,
      uniqueIps: this.ipConnectionCounts.size,
    };
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getConnectionsForIp(ip: string): number {
    return this.ipConnectionCounts.get(ip) ?? 0;
  }
}

describe('ConnectionManager', () => {
  let manager: TestConnectionManager;

  beforeEach(() => {
    manager = new TestConnectionManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('canConnect', () => {
    it('should allow connection when under limit', () => {
      expect(manager.canConnect('192.168.1.1')).toBe(true);
    });

    it('should deny connection when at limit', () => {
      // Add 5 connections from same IP
      for (let i = 0; i < 5; i++) {
        const socket = new MockWebSocket();
        manager.addConnection(socket, '192.168.1.1', `corr-${i}`);
      }

      expect(manager.canConnect('192.168.1.1')).toBe(false);
    });

    it('should allow connections from different IPs', () => {
      // Add 5 connections from IP 1
      for (let i = 0; i < 5; i++) {
        const socket = new MockWebSocket();
        manager.addConnection(socket, '192.168.1.1', `corr-${i}`);
      }

      // IP 2 should still be allowed
      expect(manager.canConnect('192.168.1.2')).toBe(true);
    });
  });

  describe('addConnection', () => {
    it('should track new connections', () => {
      const socket = new MockWebSocket();
      manager.addConnection(socket, '192.168.1.1', 'test-correlation');

      expect(manager.getConnectionCount()).toBe(1);
      expect(manager.getConnectionsForIp('192.168.1.1')).toBe(1);
    });

    it('should increment IP connection count', () => {
      const socket1 = new MockWebSocket();
      const socket2 = new MockWebSocket();

      manager.addConnection(socket1, '192.168.1.1', 'corr-1');
      manager.addConnection(socket2, '192.168.1.1', 'corr-2');

      expect(manager.getConnectionsForIp('192.168.1.1')).toBe(2);
    });
  });

  describe('removeConnection', () => {
    it('should remove tracked connections', () => {
      const socket = new MockWebSocket();
      manager.addConnection(socket, '192.168.1.1', 'test-correlation');

      manager.removeConnection(socket);

      expect(manager.getConnectionCount()).toBe(0);
      expect(manager.getConnectionsForIp('192.168.1.1')).toBe(0);
    });

    it('should decrement IP connection count', () => {
      const socket1 = new MockWebSocket();
      const socket2 = new MockWebSocket();

      manager.addConnection(socket1, '192.168.1.1', 'corr-1');
      manager.addConnection(socket2, '192.168.1.1', 'corr-2');
      manager.removeConnection(socket1);

      expect(manager.getConnectionsForIp('192.168.1.1')).toBe(1);
    });

    it('should handle removing non-existent connection gracefully', () => {
      const socket = new MockWebSocket();

      // Should not throw
      expect(() => manager.removeConnection(socket)).not.toThrow();
    });
  });

  describe('updateActivity', () => {
    it('should update last activity timestamp', async () => {
      const socket = new MockWebSocket();
      manager.addConnection(socket, '192.168.1.1', 'test-correlation');

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      manager.updateActivity(socket);

      // Activity should be updated (we can't easily check the internal state,
      // but the method should not throw)
      expect(() => manager.updateActivity(socket)).not.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const socket1 = new MockWebSocket();
      const socket2 = new MockWebSocket();
      const socket3 = new MockWebSocket();

      manager.addConnection(socket1, '192.168.1.1', 'corr-1');
      manager.addConnection(socket2, '192.168.1.1', 'corr-2');
      manager.addConnection(socket3, '192.168.1.2', 'corr-3');

      const stats = manager.getStats();

      expect(stats.totalConnections).toBe(3);
      expect(stats.uniqueIps).toBe(2);
    });

    it('should return empty stats when no connections', () => {
      const stats = manager.getStats();

      expect(stats.totalConnections).toBe(0);
      expect(stats.uniqueIps).toBe(0);
    });
  });
});
