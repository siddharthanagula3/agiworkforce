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
 *   code: '123456',
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
  /** WebSocket connection opened successfully */
  | { type: 'open' }
  /** Client successfully registered with the signaling server */
  | {
      type: 'registered';
      /** Unix timestamp (milliseconds) when the pairing code expires */
      expiresAt: number;
      /** Whether another peer is already connected to this session */
      peerConnected: boolean;
    }
  /** A peer has joined and is ready to exchange signals */
  | {
      type: 'peer_ready';
      /** Role of the peer that joined */
      role: SignalingRole;
      /** Optional metadata provided by the peer */
      metadata?: Record<string, unknown> | null;
    }
  /** Received a signaling message from a peer */
  | {
      type: 'signal';
      /** Role of the peer sending the signal */
      from: SignalingRole;
      /** Type of WebRTC signal being exchanged */
      kind: 'offer' | 'answer' | 'ice' | 'control';
      /** Signal-specific payload (e.g., SDP offer, ICE candidate) */
      payload: unknown;
    }
  /** A peer has left the session */
  | {
      type: 'peer_left';
      /** Role of the peer that disconnected */
      role: SignalingRole;
    }
  /** The pairing session has expired (5-minute TTL by default) */
  | { type: 'session_expired' }
  /** The session was explicitly terminated by the server */
  | { type: 'terminated' }
  /** An error occurred during signaling */
  | {
      type: 'error';
      /** Human-readable error message */
      error: string;
    }
  /** WebSocket connection closed */
  | { type: 'close' };

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
  /** WebSocket URL of the signaling server */
  wsUrl: string;
  /** 6-digit pairing code for the session */
  code: string;
  /** Role of this client in the peer connection */
  role: SignalingRole;
  /** Optional metadata to share with peers (e.g., device info, capabilities) */
  metadata?: Record<string, unknown>;
  /** Callback invoked for all signaling events */
  onEvent: (event: SignalingEvent) => void;
  /**
   * Interval in milliseconds for sending heartbeat pings to keep the connection alive.
   * Defaults to 30000ms (30 seconds) if not specified.
   */
  heartbeatIntervalMs?: number;
}
