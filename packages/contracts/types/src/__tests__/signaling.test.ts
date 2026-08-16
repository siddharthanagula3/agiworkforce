
import { describe, expect, it } from 'vitest';
import { SIGNALING_EVENT_TYPES, type SignalingEvent } from '../signaling';

const SERVER_SENT_TYPES: ReadonlyArray<[SignalingEvent['type'], string]> = [
  ['registered', 'services/signaling-server/src/index.ts — handleRegister'],
  ['peer_ready', 'services/signaling-server/src/index.ts — handleRegister'],
  ['signal', 'services/signaling-server/src/index.ts — handleSignal / deliverPendingApprovals'],
  ['peer_left', 'services/signaling-server/src/index.ts — socket close + error paths'],
  ['heartbeat_ack', 'services/signaling-server/src/index.ts — heartbeat handler'],
  ['session_expired', 'services/signaling-server/src/index.ts — disconnectParticipants'],
  ['terminated', 'services/signaling-server/src/index.ts — disconnectParticipants'],
  ['sync_request', 'services/signaling-server/src/index.ts — mobile reconnect state sync'],
  [
    'approval_queued',
    'services/signaling-server/src/index.ts — approval queued for offline mobile',
  ],
  ['connection_timeout', 'services/signaling-server/src/connection-manager.ts — idle cleanup'],
  ['server_shutdown', 'services/signaling-server/src/connection-manager.ts — closeAllConnections'],
  ['error', 'services/signaling-server/src/index.ts — every rejection path'],
];

describe('signaling contract — event vocabulary', () => {
  it.each(SERVER_SENT_TYPES)('covers the server-sent `%s` message (%s)', (type) => {
    expect(SIGNALING_EVENT_TYPES).toContain(type);
  });

  it('covers the socket lifecycle events the client synthesises', () => {
    expect(SIGNALING_EVENT_TYPES).toContain('open');
    expect(SIGNALING_EVENT_TYPES).toContain('close');
  });

  it('lists each discriminant exactly once', () => {
    expect(new Set(SIGNALING_EVENT_TYPES).size).toBe(SIGNALING_EVENT_TYPES.length);
  });
});

describe('signaling contract — reconnect payload shapes', () => {
  it('carries the resync cause and server clock on `sync_request`', () => {
    const event: SignalingEvent = {
      type: 'sync_request',
      reason: 'mobile_reconnected',
      timestamp: 1_770_000_000_000,
    };
    expect(event.reason).toBe('mobile_reconnected');
    expect(event.timestamp).toBeGreaterThan(0);
  });

  it('carries the pairing code on `approval_queued`', () => {
    const event: SignalingEvent = { type: 'approval_queued', code: 'ABCD1234WXYZ' };
    expect(event.code).toBe('ABCD1234WXYZ');
  });

  it('carries a reason on both server-initiated disconnects', () => {
    const timeout: SignalingEvent = { type: 'connection_timeout', reason: 'idle' };
    const shutdown: SignalingEvent = { type: 'server_shutdown', reason: 'server_shutdown' };
    expect(timeout.reason).toBe('idle');
    expect(shutdown.reason).toBe('server_shutdown');
  });
});
