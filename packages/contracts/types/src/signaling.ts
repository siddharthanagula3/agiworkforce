/**
 * Signaling Protocol Types
 *
 * Types for the WebSocket-based signaling server that coordinates real-time
 * peer-to-peer connections between desktop and mobile clients.
 *
 * @module signaling
 * @packageDocumentation
 *
 * @example Basic usage:
 * ```typescript
 * import type { SignalingEvent, SignalingClientOptions } from '@agiworkforce/types';
 *
 * const options: SignalingClientOptions = {
 *   wsUrl: 'ws://localhost:4000',
 *   code: 'ABCD1234WXYZ',
 *   pairToken: '<role-specific token from the pairing response>',
 *   role: 'desktop',
 *   onEvent: (event) => {
 *     if (event.type === 'peer_ready') {
 *       console.log('Peer connected:', event.role);
 *     }
 *   }
 * };
 * ```
 */

/**
 * Role identifier for signaling participants.
 *
 * - `desktop`: The desktop application acting as a peer
 * - `mobile`: A mobile device or web client acting as a peer
 *
 * @example
 * ```typescript
 * const role: SignalingRole = 'desktop';
 * ```
 */
export type SignalingRole = 'desktop' | 'mobile';

/**
 * Discriminated union of all possible signaling events.
 *
 * Events flow from the signaling server to clients to coordinate
 * connection establishment and maintain session state.
 *
 * @example Pattern matching on events:
 * ```typescript
 * function handleEvent(event: SignalingEvent) {
 *   switch (event.type) {
 *     case 'open':
 *       console.log('Connection opened');
 *       break;
 *     case 'registered':
 *       console.log(`Session expires at: ${new Date(event.expiresAt)}`);
 *       break;
 *     case 'signal':
 *       handleSignal(event.from, event.kind, event.payload);
 *       break;
 *     case 'error':
 *       console.error('Signaling error:', event.error);
 *       break;
 *   }
 * }
 * ```
 */
export type SignalingEvent =
  | { type: 'open' }
  /** Client successfully registered with the signaling server */
  | {
      type: 'registered';
      expiresAt: number;
      peerConnected: boolean;
    }
  /** A peer has joined and is ready to exchange signals */
  | {
      type: 'peer_ready';
      role: SignalingRole;
      metadata?: Record<string, unknown> | null;
    }
  /** Received a signaling message from a peer */
  | {
      type: 'signal';
      from: SignalingRole;
      kind: 'offer' | 'answer' | 'ice' | 'control';
      payload: unknown;
    }
  /** A peer has left the session */
  | {
      type: 'peer_left';
      role: SignalingRole;
      reason?: 'disconnect' | 'error' | 'timeout' | 'terminated';
    }
  /** Server acknowledgement for an application-level heartbeat */
  | {
      type: 'heartbeat_ack';
      timestamp: number;
    }
  /** The pairing session has expired (5-minute TTL by default) */
  | { type: 'session_expired' }
  /** The session was explicitly terminated by the server */
  | { type: 'terminated' }
  /**
   * The server asks this peer to publish its current state to the session.
   *
   * Emitted to the desktop when a mobile peer re-registers, so the phone is
   * resynced instead of rendering whatever it held before the drop.
   */
  | {
      type: 'sync_request';
      reason: string;
      timestamp: number;
    }
  /** An approval could not be relayed and is held until the mobile peer returns */
  | {
      type: 'approval_queued';
      code: string;
    }
  /** The server is dropping this socket for inactivity */
  | {
      type: 'connection_timeout';
      reason: string;
    }
  /** The server is shutting down and is closing every socket */
  | {
      type: 'server_shutdown';
      reason: string;
    }
  /** An error occurred during signaling */
  | {
      type: 'error';
      error: string;
    }
  /** WebSocket connection closed */
  | { type: 'close' };

/**
 * Every discriminant in {@link SignalingEvent}, as a runtime value.
 *
 * Clients switch on `event.type`; without a value-level list there is nothing
 * a test can assert against, which is how four server-sent types
 * (`sync_request`, `approval_queued`, `connection_timeout`, `server_shutdown`)
 * shipped in `services/signaling-server` while every client dropped them.
 *
 * The `Record` keying makes the list exhaustive by construction: a new
 * variant that is not listed here fails to compile.
 */
const SIGNALING_EVENT_TYPE_KEYS: Record<SignalingEvent['type'], true> = {
  open: true,
  registered: true,
  peer_ready: true,
  signal: true,
  peer_left: true,
  heartbeat_ack: true,
  session_expired: true,
  terminated: true,
  sync_request: true,
  approval_queued: true,
  connection_timeout: true,
  server_shutdown: true,
  error: true,
  close: true,
};

export const SIGNALING_EVENT_TYPES = Object.keys(
  SIGNALING_EVENT_TYPE_KEYS,
) as readonly SignalingEvent['type'][];

/**
 * Type of WebRTC signaling message being exchanged between peers.
 *
 * - `offer`: Initial SDP offer from the peer initiating the connection
 * - `answer`: SDP answer in response to an offer
 * - `ice`: ICE (Interactive Connectivity Establishment) candidate for NAT traversal
 * - `control`: Application-specific control message
 *
 * @example
 * ```typescript
 * const signalKind: SignalKind = 'offer';
 * ```
 */
export type SignalKind = 'offer' | 'answer' | 'ice' | 'control';

/**
 * Configuration options for the signaling client.
 *
 * @example Desktop client:
 * ```typescript
 * const options: SignalingClientOptions = {
 *   wsUrl: 'ws://localhost:4000',
 *   code: '123456',
 *   role: 'desktop',
 *   metadata: {
 *     deviceName: 'MacBook Pro',
 *     version: '1.0.0'
 *   },
 *   onEvent: (event) => {
 *     console.log('Signaling event:', event);
 *   },
 *   heartbeatIntervalMs: 30000 // 30 seconds
 * };
 * ```
 */
export interface SignalingClientOptions {
  wsUrl: string;
  code: string;
  pairToken: string;
  role: SignalingRole;
  metadata?: Record<string, unknown>;
  onEvent: (event: SignalingEvent) => void;
  heartbeatIntervalMs?: number;
}
