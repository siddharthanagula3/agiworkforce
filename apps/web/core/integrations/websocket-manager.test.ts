/**
 * WebSocket Manager Tests
 *
 * The WebSocketManager is currently a no-op stub (Realtime removed).
 * These tests verify the stub contract so callers don't break.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketManager, WebSocketState, MessageType } from './websocket-manager';

// Mock logger to suppress stub warnings during tests
vi.mock('@shared/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('WebSocket Manager', () => {
  let manager: WebSocketManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new WebSocketManager();

    // Suppress console logs during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await manager.cleanup();
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create manager with default config', () => {
      const defaultManager = new WebSocketManager();

      expect(defaultManager).toBeDefined();
    });

    it('should create manager with custom config', () => {
      const customManager = new WebSocketManager({
        reconnectInterval: 2000,
        maxReconnectAttempts: 10,
        heartbeatInterval: 60000,
        messageQueueSize: 500,
      });

      expect(customManager).toBeDefined();
    });
  });

  describe('connect (no-op stub)', () => {
    it('should not throw when connecting', async () => {
      await expect(manager.connect('test-connection')).resolves.toBeUndefined();
    });

    it('should not throw when connecting with session ID', async () => {
      await expect(manager.connect('test-connection', 'session-123')).resolves.toBeUndefined();
    });

    it('getState should return undefined for any connection (stub has no state)', async () => {
      await manager.connect('test-connection');

      expect(manager.getState('test-connection')).toBeUndefined();
    });
  });

  describe('disconnect (no-op stub)', () => {
    it('should not throw when disconnecting', async () => {
      await manager.connect('test-connection');
      await expect(manager.disconnect('test-connection')).resolves.toBeUndefined();
    });

    it('should not throw when disconnecting non-existent connection', async () => {
      await expect(manager.disconnect('non-existent')).resolves.toBeUndefined();
    });
  });

  describe('send (no-op stub)', () => {
    it('should not throw when sending a message', async () => {
      await expect(
        manager.send('test-connection', {
          type: MessageType.CHAT,
          payload: { text: 'Hello' },
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('broadcast (no-op stub)', () => {
    it('should not throw when broadcasting', async () => {
      await expect(
        manager.broadcast({
          type: MessageType.SYSTEM,
          payload: { announcement: 'Hello everyone' },
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('onMessage (no-op stub)', () => {
    it('should register message handler and return unsubscribe function', () => {
      const handler = vi.fn();

      const unsubscribe = manager.onMessage(MessageType.CHAT, handler);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should return unsubscribe function that does not throw', () => {
      const handler = vi.fn();

      const unsubscribe = manager.onMessage(MessageType.CHAT, handler);
      expect(() => unsubscribe()).not.toThrow();
    });
  });

  describe('on (connection events, no-op stub)', () => {
    it('should return no-op function for any connection', () => {
      const handler = vi.fn();
      const unsubscribe = manager.on('test-connection', 'message', handler);

      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('onGlobal (no-op stub)', () => {
    it('should register global event listener and return unsubscribe function', () => {
      const handler = vi.fn();

      const unsubscribe = manager.onGlobal('connected', handler);

      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('getState (no-op stub)', () => {
    it('should return undefined for any connection', async () => {
      await manager.connect('test-connection');

      expect(manager.getState('test-connection')).toBeUndefined();
    });

    it('should return undefined for non-existent connection', () => {
      expect(manager.getState('non-existent')).toBeUndefined();
    });
  });

  describe('getMetrics (no-op stub)', () => {
    it('should return undefined for any connection', async () => {
      await manager.connect('test-connection');

      expect(manager.getMetrics('test-connection')).toBeUndefined();
    });

    it('should return undefined for non-existent connection', () => {
      expect(manager.getMetrics('non-existent')).toBeUndefined();
    });
  });

  describe('getAllConnections (no-op stub)', () => {
    it('should always return empty array', async () => {
      await manager.connect('connection-1');
      await manager.connect('connection-2');

      expect(manager.getAllConnections()).toEqual([]);
    });
  });

  describe('getConnectionCount (no-op stub)', () => {
    it('should always return 0', async () => {
      await manager.connect('connection-1');
      await manager.connect('connection-2');

      expect(manager.getConnectionCount()).toBe(0);
    });
  });

  describe('isConnected (no-op stub)', () => {
    it('should always return false', async () => {
      await manager.connect('test-connection');

      expect(manager.isConnected('test-connection')).toBe(false);
    });

    it('should return false for non-existent connection', () => {
      expect(manager.isConnected('non-existent')).toBe(false);
    });
  });

  describe('cleanup (no-op stub)', () => {
    it('should not throw when cleaning up', async () => {
      await expect(manager.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('native WebSocket mode', () => {
    it('should create manager with native WebSocket config', () => {
      const nativeManager = new WebSocketManager({
        useNeonRealtime: false,
        url: 'wss://test.example.com',
      });

      expect(nativeManager).toBeDefined();
      expect(nativeManager.getConnectionCount()).toBe(0);
    });
  });

  describe('WebSocketState enum', () => {
    it('should export expected state values', () => {
      expect(WebSocketState.CONNECTING).toBe('CONNECTING');
      expect(WebSocketState.CONNECTED).toBe('CONNECTED');
      expect(WebSocketState.DISCONNECTED).toBe('DISCONNECTED');
      expect(WebSocketState.FAILED).toBe('FAILED');
    });
  });

  describe('MessageType enum', () => {
    it('should export expected message types', () => {
      expect(MessageType.CHAT).toBe('CHAT');
      expect(MessageType.SYSTEM).toBe('SYSTEM');
      expect(MessageType.HEARTBEAT).toBe('HEARTBEAT');
    });
  });
});
