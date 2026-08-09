/**
 * Shared signaling client — inbound message dispatch.
 *
 * Both the desktop and mobile companions drive this class, so a message type
 * that falls through to `default: break` here is invisible on every surface.
 */

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

  /** Deliver a server frame exactly as the WebSocket would. */
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const originalWebSocket = globalThis.WebSocket;

function connect(): { socket: FakeWebSocket; events: SignalingEvent[]; client: SignalingClient } {
  const events: SignalingEvent[] = [];
  const client = new SignalingClient({
    wsUrl: 'ws://localhost:4000',
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

describe('SignalingClient — server-sent reconnect messages', () => {
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
