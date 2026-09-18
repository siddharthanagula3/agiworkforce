import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { connectionManager, DEVICE_STALE_AFTER_MS } from '../src/connection-manager.js';

class FakeSocket extends EventEmitter {
  readyState = 1;
  send = vi.fn();
  close = vi.fn();
}

const sockets: FakeSocket[] = [];

function connect(): FakeSocket {
  const socket = new FakeSocket();
  sockets.push(socket);
  connectionManager.addConnection(
    socket as unknown as WebSocket,
    '203.0.113.9',
    `fresh-${sockets.length}`,
  );
  return socket;
}

afterEach(() => {
  for (const socket of sockets) {
    connectionManager.removeConnection(socket as unknown as WebSocket);
  }
  sockets.length = 0;
  connectionManager.reinstateDevice('device-fresh');
});

describe('device status freshness', () => {
  it('is offline for a device the relay has never seen', () => {
    expect(connectionManager.getDeviceFreshness('device-fresh')).toBe('offline');
    expect(connectionManager.getDeviceLastActivity('device-fresh')).toBeNull();
  });

  /** L73086: quiet is not the same as connected, and the relay says which. */
  it('goes stale once the device stops talking, without waiting for the socket to close', () => {
    const socket = connect();
    connectionManager.bindDevice(socket as unknown as WebSocket, 'device-fresh');

    const boundAt = connectionManager.getDeviceLastActivity('device-fresh');
    expect(boundAt).not.toBeNull();

    const now = (boundAt as number) + DEVICE_STALE_AFTER_MS;
    expect(connectionManager.getDeviceFreshness('device-fresh', now)).toBe('online');
    expect(connectionManager.getDeviceFreshness('device-fresh', now + 1)).toBe('stale');
    expect(socket.close).not.toHaveBeenCalled();
  });

  /** L72734/L73636: the beat after a relay disconnect makes the device current again. */
  it('recovers on the next message after a gap', () => {
    const socket = connect();
    connectionManager.bindDevice(socket as unknown as WebSocket, 'device-fresh');
    const boundAt = connectionManager.getDeviceLastActivity('device-fresh') as number;

    expect(
      connectionManager.getDeviceFreshness('device-fresh', boundAt + DEVICE_STALE_AFTER_MS + 1),
    ).toBe('stale');

    connectionManager.updateActivity(socket as unknown as WebSocket);
    const seenAgain = connectionManager.getDeviceLastActivity('device-fresh') as number;
    expect(connectionManager.getDeviceFreshness('device-fresh', seenAgain)).toBe('online');
  });

  it('takes the freshest of a device several sockets', () => {
    const quiet = connect();
    const live = connect();
    connectionManager.bindDevice(quiet as unknown as WebSocket, 'device-fresh');
    connectionManager.bindDevice(live as unknown as WebSocket, 'device-fresh');

    const at = connectionManager.getDeviceLastActivity('device-fresh') as number;
    expect(connectionManager.getDeviceFreshness('device-fresh', at)).toBe('online');
    expect(connectionManager.getDeviceConnectionCount('device-fresh')).toBe(2);
  });

  /** A revoked device is offline whatever its sockets were doing a moment ago. */
  it('reports a revoked device as offline rather than stale', () => {
    const socket = connect();
    connectionManager.bindDevice(socket as unknown as WebSocket, 'device-fresh');
    connectionManager.revokeDevice('device-fresh');

    expect(connectionManager.getDeviceFreshness('device-fresh')).toBe('offline');
  });

  /** L73653: the counts a device-status dashboard reads off the relay. */
  it('counts bound devices by freshness', () => {
    const socket = connect();
    connectionManager.bindDevice(socket as unknown as WebSocket, 'device-fresh');
    const at = connectionManager.getDeviceLastActivity('device-fresh') as number;

    expect(connectionManager.getDeviceStatusCounts(at)).toMatchObject({ online: 1, stale: 0 });
    expect(connectionManager.getDeviceStatusCounts(at + DEVICE_STALE_AFTER_MS + 1)).toMatchObject({
      online: 0,
      stale: 1,
    });
  });
});
