/**
 * Signaling contract — the client-visible event vocabulary.
 *
 * `services/signaling-server` sends four message types that the contract used
 * to omit, so every client fell through to `default: break` and silently
 * discarded them. These tests lock the vocabulary against the server's emit
 * sites; the shapes are exercised in
 * `packages/platform/utils/src/__tests__/signaling.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { SIGNALING_EVENT_TYPES, type SignalingEvent } from '../signaling';

/**
 * Every type the signaling server puts on the wire toward a client, with the
 * emit site that proves it. Anything here that the contract omits is a message
 * clients cannot see.
 */
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
    // Not server-sent: the client raises these from the WebSocket itself.
    expect(SIGNALING_EVENT_TYPES).toContain('open');
    expect(SIGNALING_EVENT_TYPES).toContain('close');
  });

  it('lists each discriminant exactly once', () => {
    expect(new Set(SIGNALING_EVENT_TYPES).size).toBe(SIGNALING_EVENT_TYPES.length);
  });
});

describe('signaling contract — reconnect payload shapes', () => {
  it('carries the resync cause and server clock on `sync_request`', () => {
    // Mobile reconnect state-sync: desktop needs both to decide whether the
    // request is current before it republishes state.
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
