import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignalingEvent } from '@agiworkforce/types';
import { SignalingClient } from '../signaling';

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = 3;
  }

  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const originalWebSocket = globalThis.WebSocket;

function connect(): { socket: FakeWebSocket; events: SignalingEvent[]; client: SignalingClient } {
  const events: SignalingEvent[] = [];
  const client = new SignalingClient({
    wsUrl: 'ws://localhost:4000',
    allowInsecureLoopback: true,
    code: 'ABCD1234WXYZ',
    pairToken: 'token',
    role: 'desktop',
    onEvent: (event) => events.push(event),
  });
  const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
  return { socket, events, client };
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  (globalThis as { WebSocket: unknown }).WebSocket = FakeWebSocket;
});

afterEach(() => {
  (globalThis as { WebSocket: unknown }).WebSocket = originalWebSocket;
  vi.restoreAllMocks();
});

describe('SignalingClient, server-sent reconnect messages', () => {
  it('retains the replacement credential before notifying the registration owner', () => {
    const options = {
      wsUrl: 'ws://localhost:4000',
      allowInsecureLoopback: true,
      code: 'ABCD1234WXYZ',
      role: 'desktop' as const,
      pairToken: 'a'.repeat(64),
      onEvent: vi.fn(),
    };
    options.onEvent.mockImplementation((event: SignalingEvent) => {
      if (event.type === 'registered') expect(options.pairToken).toBe('b'.repeat(64));
    });
    const client = new SignalingClient(options);
    const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
    socket.receive({
      type: 'registered',
      pairToken: 'b'.repeat(64),
      expiresAt: 1234,
      peerConnected: false,
    });
    expect(options.pairToken).toBe('b'.repeat(64));
    expect(options.onEvent).toHaveBeenCalledWith({
      type: 'registered',
      pairToken: 'b'.repeat(64),
      expiresAt: 1234,
      peerConnected: false,
    });
    client.close();
  });

  it.each([undefined, '', 'not-a-token', 'a'.repeat(65)])(
    'refuses registration without a valid replacement: %s',
    (pairToken) => {
      const { socket, events, client } = connect();
      socket.receive({ type: 'registered', pairToken, expiresAt: 1234, peerConnected: false });
      expect(events).toContainEqual({ type: 'error', error: 'invalid_pair_credential' });
      expect(events.some((event) => event.type === 'registered')).toBe(false);
      expect(socket.readyState).toBe(3);
      client.close();
    },
  );

  it('reports whether the local websocket accepted an outbound signal', () => {
    const { socket, client } = connect();

    expect(client.sendSignal('control', { action: 'heartbeat' })).toBe(true);
    socket.readyState = 0;
    expect(client.sendSignal('control', { action: 'heartbeat' })).toBe(false);
    client.close();
  });

  it('surfaces sync_request so the desktop can republish state', () => {
    const { socket, events, client } = connect();

    socket.receive({ type: 'sync_request', reason: 'mobile_reconnected', timestamp: 1_700_000 });

    expect(events).toContainEqual({
      type: 'sync_request',
      reason: 'mobile_reconnected',
      timestamp: 1_700_000,
    });
    client.close();
  });

  it('surfaces approval_queued with the pairing code', () => {
    const { socket, events, client } = connect();

    socket.receive({ type: 'approval_queued', code: 'ABCD1234WXYZ' });

    expect(events).toContainEqual({ type: 'approval_queued', code: 'ABCD1234WXYZ' });
    client.close();
  });

  it('surfaces connection_timeout and server_shutdown', () => {
    const { socket, events, client } = connect();

    socket.receive({ type: 'connection_timeout', reason: 'idle' });
    socket.receive({ type: 'server_shutdown', reason: 'deploy' });

    expect(events).toContainEqual({ type: 'connection_timeout', reason: 'idle' });
    expect(events).toContainEqual({ type: 'server_shutdown', reason: 'deploy' });
    client.close();
  });

  it('falls back to defaults when the server omits optional fields', () => {
    const { socket, events, client } = connect();

    socket.receive({ type: 'connection_timeout' });
    socket.receive({ type: 'approval_queued' });

    expect(events).toContainEqual({ type: 'connection_timeout', reason: 'idle' });
    expect(events).toContainEqual({ type: 'approval_queued', code: '' });
    client.close();
  });

  it('still warns on a genuinely unknown type', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { socket, events, client } = connect();

    socket.receive({ type: 'not_a_real_message' });

    expect(events).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    client.close();
  });
});

describe('SignalingClient, host-supplied socket', () => {
  it('permits an explicitly enabled local development socket', () => {
    const createSocket = vi.fn((url: string) => new FakeWebSocket(url) as unknown as WebSocket);
    const client = new SignalingClient({
      wsUrl: 'ws://[::1]:4000/ws',
      allowInsecureLoopback: true,
      code: 'ABCD1234WXYZ',
      pairToken: 'private-credential',
      role: 'desktop',
      onEvent: vi.fn(),
      createSocket,
    });
    expect(createSocket).toHaveBeenCalledWith('ws://[::1]:4000/ws');
    client.close();
  });

  it.each([
    'ws://relay.example/ws',
    'ws://localhost:4000/ws',
    'wss://token@relay.example/ws',
    'wss://relay.example/ws#token',
    'wss://relay.example/\nws',
  ])('refuses %s before invoking a host socket factory', (wsUrl) => {
    const createSocket = vi.fn((url: string) => new FakeWebSocket(url) as unknown as WebSocket);
    expect(
      () =>
        new SignalingClient({
          wsUrl,
          code: 'ABCD1234WXYZ',
          pairToken: 'private-credential',
          role: 'desktop',
          onEvent: vi.fn(),
          createSocket,
        }),
    ).toThrow();
    expect(createSocket).not.toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('opens the socket the host builds, so a non-browser host can present its origin', () => {
    const built: string[] = [];
    new SignalingClient({
      wsUrl: 'wss://relay.example/ws',
      code: 'ABCD1234WXYZ',
      pairToken: 'token',
      role: 'desktop',
      onEvent: () => undefined,
      createSocket: (url) => {
        built.push(url);
        return new FakeWebSocket(url) as unknown as WebSocket;
      },
    });

    expect(built).toEqual(['wss://relay.example/ws']);
    const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
    socket.onopen?.();
    expect(JSON.parse(socket.sent[0]!)).toMatchObject({ type: 'register', role: 'desktop' });
  });
});
