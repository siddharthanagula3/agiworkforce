import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import {
  connectionManager,
  DEVICE_REVOKED_CLOSE_CODE,
  DEVICE_REVOKED_REASON,
} from '../src/connection-manager.js';

class FakeSocket extends EventEmitter {
  readyState = 1;
  send = vi.fn();
  close = vi.fn();
}

const sockets: FakeSocket[] = [];

function connect(ip = '203.0.113.7'): FakeSocket {
  const socket = new FakeSocket();
  sockets.push(socket);
  connectionManager.addConnection(socket as unknown as WebSocket, ip, `corr-${sockets.length}`);
  return socket;
}

afterEach(() => {
  for (const socket of sockets) {
    connectionManager.removeConnection(socket as unknown as WebSocket);
  }
  sockets.length = 0;
  connectionManager.reinstateDevice('device-a');
  connectionManager.reinstateDevice('device-b');
});

describe('device revocation fan-out', () => {
  it('drops every connection the device holds on the call, not on a later sweep', () => {
    const first = connect();
    const second = connect();
    connectionManager.bindDevice(first as unknown as WebSocket, 'device-a');
    connectionManager.bindDevice(second as unknown as WebSocket, 'device-a');
    expect(connectionManager.getDeviceConnectionCount('device-a')).toBe(2);

    const closed = connectionManager.revokeDevice('device-a');

    expect(closed).toBe(2);
    expect(first.close).toHaveBeenCalledWith(DEVICE_REVOKED_CLOSE_CODE, DEVICE_REVOKED_REASON);
    expect(second.close).toHaveBeenCalledWith(DEVICE_REVOKED_CLOSE_CODE, DEVICE_REVOKED_REASON);
    expect(connectionManager.getDeviceConnectionCount('device-a')).toBe(0);
  });

  it('tells the client why before closing, so it stops rather than retrying', () => {
    const socket = connect();
    connectionManager.bindDevice(socket as unknown as WebSocket, 'device-a');

    connectionManager.revokeDevice('device-a', 'unlinked_by_owner');

    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: DEVICE_REVOKED_REASON, reason: 'unlinked_by_owner' }),
    );
  });

  it('leaves other devices alone', () => {
    const revoked = connect();
    const untouched = connect();
    connectionManager.bindDevice(revoked as unknown as WebSocket, 'device-a');
    connectionManager.bindDevice(untouched as unknown as WebSocket, 'device-b');

    connectionManager.revokeDevice('device-a');

    expect(untouched.close).not.toHaveBeenCalled();
    expect(connectionManager.getDeviceConnectionCount('device-b')).toBe(1);
  });

  it('refuses a reconnect that arrives after the revocation', () => {
    connectionManager.revokeDevice('device-a');
    const reconnect = connect();

    const bound = connectionManager.bindDevice(reconnect as unknown as WebSocket, 'device-a');

    expect(bound).toBe(false);
    expect(connectionManager.isDeviceRevoked('device-a')).toBe(true);
    expect(reconnect.close).toHaveBeenCalledWith(DEVICE_REVOKED_CLOSE_CODE, DEVICE_REVOKED_REASON);
    expect(connectionManager.getDeviceConnectionCount('device-a')).toBe(0);
  });

  it('accepts the device again once it is paired back', () => {
    connectionManager.revokeDevice('device-a');
    connectionManager.reinstateDevice('device-a');
    const socket = connect();

    expect(connectionManager.bindDevice(socket as unknown as WebSocket, 'device-a')).toBe(true);
    expect(connectionManager.getDeviceConnectionCount('device-a')).toBe(1);
  });

  it('forgets the binding when the socket closes on its own', () => {
    const socket = connect();
    connectionManager.bindDevice(socket as unknown as WebSocket, 'device-a');

    connectionManager.removeConnection(socket as unknown as WebSocket);

    expect(connectionManager.getDeviceConnectionCount('device-a')).toBe(0);
  });

  it('revoking a device with nothing connected still blocks its next connection', () => {
    expect(connectionManager.revokeDevice('device-b')).toBe(0);
    const socket = connect();
    expect(connectionManager.bindDevice(socket as unknown as WebSocket, 'device-b')).toBe(false);
  });
});
