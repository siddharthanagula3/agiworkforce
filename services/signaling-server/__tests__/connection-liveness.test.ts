import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import { connectionManager } from '../src/connection-manager.js';
import { WS_MISSED_PONGS_BEFORE_TERMINATE } from '../src/constants.js';

class FakeSocket extends EventEmitter {
  readyState = 1;
  send = vi.fn();
  ping = vi.fn();
  terminate = vi.fn(() => {
    this.readyState = 3;
  });
  close = vi.fn(() => {
    this.readyState = 3;
  });
}

const CLIENT_IP = '203.0.113.9';

afterEach(async () => {
  await connectionManager.closeAllConnections('test_cleanup');
  connectionManager.stop();
});

describe('connection liveness', () => {
  it('terminates a socket that leaves its pings unanswered and frees its slot', () => {
    const silent = new FakeSocket();
    connectionManager.addConnection(silent as unknown as WebSocket, CLIENT_IP, 'silent');

    for (let tick = 0; tick < WS_MISSED_PONGS_BEFORE_TERMINATE; tick++) {
      expect(connectionManager.pingConnections()).toBe(0);
    }
    expect(silent.ping).toHaveBeenCalledTimes(WS_MISSED_PONGS_BEFORE_TERMINATE);
    expect(silent.terminate).not.toHaveBeenCalled();

    expect(connectionManager.pingConnections()).toBe(1);
    expect(silent.terminate).toHaveBeenCalledTimes(1);
    expect(connectionManager.getConnectionCount()).toBe(0);
    expect(connectionManager.getStats().connectionsByIp.get(CLIENT_IP)).toBeUndefined();
    expect(connectionManager.getStats().closeReasons.get('ping_timeout')).toBeGreaterThan(0);
  });

  it('keeps a socket that answers its pings', () => {
    const live = new FakeSocket();
    connectionManager.addConnection(live as unknown as WebSocket, CLIENT_IP, 'live');

    for (let tick = 0; tick < WS_MISSED_PONGS_BEFORE_TERMINATE * 3; tick++) {
      connectionManager.pingConnections();
      connectionManager.updateActivity(live as unknown as WebSocket);
    }

    expect(live.terminate).not.toHaveBeenCalled();
    expect(connectionManager.getConnectionCount()).toBe(1);
  });

  it('pings on its own once started', () => {
    vi.useFakeTimers();
    try {
      const silent = new FakeSocket();
      connectionManager.addConnection(silent as unknown as WebSocket, CLIENT_IP, 'timed');
      connectionManager.start(1_000);
      vi.advanceTimersByTime(1_000 * (WS_MISSED_PONGS_BEFORE_TERMINATE + 1));
      expect(silent.terminate).toHaveBeenCalledTimes(1);
    } finally {
      connectionManager.stop();
      vi.useRealTimers();
    }
  });
});
