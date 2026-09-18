import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import { connectionManager } from '../src/connection-manager.js';
import { MAX_CONNECTIONS_PER_IP } from '../src/constants.js';

class FakeSocket extends EventEmitter {
  readyState = 1;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
  });
}

function socket(): WebSocket {
  return new FakeSocket() as unknown as WebSocket;
}

const CLIENT_IP = '203.0.113.7';

afterEach(async () => {
  await connectionManager.closeAllConnections('test_cleanup');
  connectionManager.stop();
});

describe('server restart', () => {
  it('releases every connection slot so the same client can reconnect', async () => {
    const sockets = Array.from({ length: MAX_CONNECTIONS_PER_IP }, () => socket());
    sockets.forEach((client, index) =>
      connectionManager.addConnection(client, CLIENT_IP, `c${index}`),
    );

    expect(connectionManager.canConnect(CLIENT_IP)).toBe(false);

    await connectionManager.closeAllConnections('server_shutdown');

    expect(connectionManager.getConnectionCount()).toBe(0);
    expect(connectionManager.getStats().uniqueIps).toBe(0);
    expect(connectionManager.canConnect(CLIENT_IP)).toBe(true);

    const reconnected = socket();
    connectionManager.addConnection(reconnected, CLIENT_IP, 'after-restart');
    expect(connectionManager.getConnectionCount()).toBe(1);
  });

  it('tells connected clients the server is going away before closing them', async () => {
    const client = new FakeSocket();
    connectionManager.addConnection(client as unknown as WebSocket, CLIENT_IP, 'c1');

    await connectionManager.closeAllConnections('deploy');

    expect(client.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'server_shutdown', reason: 'deploy' }),
    );
    expect(client.close).toHaveBeenCalledWith(1001, 'deploy');
  });

  it('does not leave session state behind when a socket refuses to close', async () => {
    const stubborn = new FakeSocket();
    stubborn.close = vi.fn(() => {
      throw new Error('socket already destroyed');
    });
    connectionManager.addConnection(stubborn as unknown as WebSocket, CLIENT_IP, 'c1');

    await connectionManager.closeAllConnections('server_shutdown');

    expect(connectionManager.getConnectionCount()).toBe(0);
    expect(connectionManager.canConnect(CLIENT_IP)).toBe(true);
  });

  it('records why the connections went away rather than losing the reason', async () => {
    connectionManager.addConnection(socket(), CLIENT_IP, 'c1');

    await connectionManager.closeAllConnections('rolling_restart');

    expect(connectionManager.getStats().closeReasons.get('rolling_restart')).toBe(1);
  });

  it('resolves immediately when there is nothing to close', async () => {
    await expect(connectionManager.closeAllConnections()).resolves.toBeUndefined();
  });
});

describe('session state cleanup on failure', () => {
  it('forgets a connection that errored, freeing its per-IP slot', () => {
    const failed = socket();
    connectionManager.addConnection(failed, CLIENT_IP, 'c1');

    connectionManager.removeConnection(failed, { trigger: 'error', closeCode: 1006 });

    expect(connectionManager.getConnectionCount()).toBe(0);
    expect(connectionManager.getStats().connectionsByIp.get(CLIENT_IP)).toBeUndefined();
    expect(connectionManager.getStats().closeReasons.get('code_1006')).toBe(1);
  });

  it('is idempotent, so a close event after cleanup cannot double-count', () => {
    const client = socket();
    connectionManager.addConnection(client, CLIENT_IP, 'c1');
    connectionManager.addConnection(socket(), CLIENT_IP, 'c2');

    connectionManager.removeConnection(client, { trigger: 'server_cleanup' });
    connectionManager.removeConnection(client, { trigger: 'socket_close' });

    expect(connectionManager.getStats().connectionsByIp.get(CLIENT_IP)).toBe(1);
  });

  it('drops the correlation id with the connection so it cannot be reused', () => {
    const client = socket();
    connectionManager.addConnection(client, CLIENT_IP, 'correlation-1');
    expect(connectionManager.getCorrelationId(client)).toBe('correlation-1');

    connectionManager.removeConnection(client, { trigger: 'error' });

    expect(connectionManager.getCorrelationId(client)).toBeUndefined();
    expect(connectionManager.getIp(client)).toBeUndefined();
  });
});
