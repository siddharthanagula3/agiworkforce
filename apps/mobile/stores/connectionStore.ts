import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/mmkv';
import { SignalingClient } from '@agiworkforce/utils';
import type { SignalingEvent, SignalKind } from '@agiworkforce/types';
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } from 'react-native-webrtc';
import {
  deriveDispatchSecret,
  signMessage,
  verifyMessage,
  type HmacSessionState,
} from '@/lib/dispatchHmac';
// MED-MOB-05 fix: per-field Agent payload validator. Lives in its own
// file so it can be unit-tested without pulling in react-native-webrtc.
import { parseAgent, MAX_AGENTS_PER_UPDATE } from '@/lib/dispatchAgentValidator';

/** RTCConfiguration is defined internally in react-native-webrtc but not re-exported. */
interface RTCConfiguration {
  iceServers?: Array<{ urls: string | string[]; username?: string; credential?: string }>;
  iceTransportPolicy?: 'all' | 'relay';
  bundlePolicy?: 'balanced' | 'max-bundle' | 'max-compat';
  rtcpMuxPolicy?: 'require' | 'negotiate';
  iceCandidatePoolSize?: number;
}

/** RTCIceCandidateInit is defined internally in react-native-webrtc but not re-exported. */
interface RTCIceCandidateInit {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}
import { WS_URL } from '@/lib/constants';
import { useAgentStore } from './agentStore';
import type { Agent } from './agentStore';
import { useDispatchStore } from './dispatchStore';
import type { DispatchMessage, TaskStatus, TaskResult } from './dispatchStore';
import { notifyCompanionMessage } from '@/services/companionNotifications';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'stale'
  | 'reconnecting'
  | 'session_expired';

/** Qualitative indicator of connection health based on heartbeat latency */
export type ConnectionQuality = 'strong' | 'weak' | 'disconnected';

export interface DesktopMetadata {
  deviceName?: string;
  platform?: string;
  version?: string;
  os?: string;
  [key: string]: unknown;
}

interface ConnectionState {
  /** Current connection status */
  status: ConnectionStatus;
  /** Active pairing code (8 uppercase alphanumeric chars extracted from QR) */
  pairingCode: string | null;
  /** Desktop device name from peer metadata */
  desktopName: string | null;
  /** Full desktop metadata (version, platform, etc.) */
  desktopMetadata: DesktopMetadata | null;
  /** Human-readable error message when status is 'error' */
  error: string | null;
  /** Session expiry timestamp (ms since epoch) */
  sessionExpiresAt: number | null;
  /** Timestamp of last successful heartbeat pong from desktop (ms) */
  lastHeartbeatAt: number | null;
  /** Latency of the last heartbeat round-trip in ms (null if no pong received) */
  lastHeartbeatLatencyMs: number | null;
  /** How many consecutive heartbeats have been missed */
  missedHeartbeats: number;
  /** Countdown (seconds) until next reconnect attempt when reconnecting */
  reconnectCountdown: number;
  /** Qualitative connection quality derived from heartbeat latency */
  connectionQuality: ConnectionQuality;
  /** Telemetry: total reconnect attempts in this session */
  reconnectAttempts: number;
  /** Telemetry: number of successful reconnects */
  reconnectSuccesses: number;
  /** Telemetry: ms from reconnect start to connected (most recent) */
  lastReconnectDurationMs: number | null;
  /** Timestamp when the current reconnect attempt started (ms) */
  reconnectStartedAt: number | null;

  // --- Actions ---
  connect: (code: string) => void;
  disconnect: () => void;
  sendControl: (action: string, payload?: unknown) => void;
  /** Queue a control message to send once reconnected */
  queueControl: (action: string, payload?: unknown) => void;
  clearError: () => void;
  /** Record a heartbeat pong received from the desktop */
  recordHeartbeat: (latencyMs?: number) => void;
  /** Mark the status as stale after a missed heartbeat */
  markStale: () => void;
  /** Begin reconnecting countdown */
  beginReconnecting: (countdownSeconds: number) => void;
  /** Decrement reconnect countdown by 1 */
  tickReconnectCountdown: () => void;
  /** Mark session as expired */
  markSessionExpired: () => void;
}

/** Signaling client instance — kept outside state to avoid serialization */
let signalingClient: SignalingClient | null = null;

/**
 * HIGH-MOB-05 fix (2026-05-04, v2 nonce scheme 2026-05-05): per-session
 * HMAC state. Initialised when a pairing code is resolved to a shared secret.
 * Outgoing messages are signed; incoming messages are verified before dispatch.
 * The nonceCache (Map<nonce, receivedAt>) is pruned by verifyMessage() on
 * each inbound message — no separate GC timer needed.
 */
let hmacState: HmacSessionState | null = null;

/** Queue of control messages to flush once reconnected. Capped to prevent unbounded growth. */
const pendingControlQueue: Array<{ action: string; payload: unknown }> = [];
const MAX_PENDING_QUEUE = 200;

/** Drain and send all queued control messages */
function flushPendingControlQueue(): void {
  if (pendingControlQueue.length === 0) return;
  const store = useConnectionStore.getState();
  while (pendingControlQueue.length > 0) {
    const msg = pendingControlQueue.shift();
    if (msg) {
      store.sendControl(msg.action, msg.payload);
    }
  }
}

/** WebRTC peer connection for low-latency data channel */
let peerConnection: RTCPeerConnection | null = null;

/** RTCDataChannel type extracted from createDataChannel return type */
type RTCDataChannelType = ReturnType<RTCPeerConnection['createDataChannel']>;

/** SDP init dict for RTCSessionDescription constructor */
interface RTCSessionDescriptionInit {
  sdp: string;
  type: string;
}

/** WebRTC data channel for control messages */
let dataChannel: RTCDataChannelType | null = null;

/**
 * Parse the pairing code from a QR string.
 * Accepts raw codes or the `agiw:XXXXXXXX` format.
 * Normalizes to uppercase to match server-generated codes (`/^[A-Z0-9]{8}$/`).
 */
function parsePairingCode(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('agiw:')) {
    return trimmed.slice(5).toUpperCase();
  }
  return trimmed.toUpperCase();
}

// ---------------------------------------------------------------------------
// Runtime type guards for incoming control messages (no Zod dependency)
// ---------------------------------------------------------------------------

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const VALID_TASK_STATUSES = new Set(['pending', 'working', 'completed', 'failed']);

function isTaskStatus(v: unknown): v is TaskStatus {
  return isString(v) && VALID_TASK_STATUSES.has(v);
}

/**
 * Handle incoming control messages from the desktop via signaling or data channel.
 * All fields are validated at runtime before use — no unsafe `as` casts.
 *
 * HIGH-MOB-05 fix (v2 nonce scheme 2026-05-05): messages are expected to be
 * signed envelopes { hmac, nonce, payload, ts, type }. When hmacState is
 * initialised the envelope is verified before the inner payload is processed.
 * Messages that fail verification are silently dropped (no error state —
 * avoids providing an oracle to an active attacker).
 *
 * Transitional: unsigned messages (no `hmac` field) are accepted with a
 * console.warn until DISPATCH_HMAC_REQUIRED_AFTER (2026-06-05). In that case
 * the entire envelope object IS the inner payload and is passed directly to
 * handleControlMessageInner without unwrapping.
 *
 * When hmacState is null (HKDF derivation not yet complete — a narrow window
 * at the very start of connect()) the raw payload is passed as-is.
 */
async function handleControlMessageAsync(envelope: unknown): Promise<void> {
  let payload: unknown = envelope;

  if (hmacState) {
    const result = await verifyMessage(hmacState, envelope);
    if (!result.ok) {
      console.warn('[dispatch] Message rejected:', result.reason);
      return;
    }
    // Unwrap inner payload when the envelope is a proper signed message.
    // Unsigned transitional messages (ok=true but no hmac field) ARE the
    // payload — do not attempt to unwrap a .payload property.
    const isSignedEnvelope =
      typeof envelope === 'object' &&
      envelope !== null &&
      typeof (envelope as Record<string, unknown>)['hmac'] === 'string';
    if (isSignedEnvelope) {
      payload = (envelope as { payload: unknown }).payload;
    }
    // else: transitional unsigned — payload stays = envelope (the raw object)
  }

  handleControlMessageInner(payload);
}

/** Synchronous caller for data-channel messages (wraps async handler). */
function handleControlMessage(payload: unknown): void {
  handleControlMessageAsync(payload).catch((err) => {
    console.warn('[dispatch] handleControlMessageAsync error:', err);
  });
}

function handleControlMessageInner(payload: unknown): void {
  if (!isObject(payload)) return;
  const action = isString(payload['action']) ? payload['action'] : undefined;
  if (!action) return;

  switch (action) {
    case 'agents_update': {
      const agents = payload['agents'];
      if (Array.isArray(agents)) {
        // MED-MOB-05 fix (red-team 2026-05): per-field validation via
        // parseAgent. Cap to MAX_AGENTS_PER_UPDATE so a malicious relay
        // cannot flood the UI with thousands of fake entries.
        const capped = agents.slice(0, MAX_AGENTS_PER_UPDATE);
        const valid: Agent[] = [];
        for (const raw of capped) {
          const parsed = parseAgent(raw);
          if (parsed) valid.push(parsed);
        }
        useAgentStore.getState().setAgents(valid);
      }
      break;
    }
    case 'agent_update': {
      const agentId = isString(payload['agentId']) ? payload['agentId'] : undefined;
      const patch = isObject(payload['patch']) ? payload['patch'] : undefined;
      if (agentId && patch) {
        useAgentStore.getState().updateAgent(agentId, patch as Partial<Omit<Agent, 'id'>>);
      }
      break;
    }
    case 'agent_removed': {
      const agentId = isString(payload['agentId']) ? payload['agentId'] : undefined;
      if (agentId) {
        useAgentStore.getState().removeAgent(agentId);
      }
      break;
    }
    case 'pong': {
      const pingTimestamp = isNumber(payload['timestamp']) ? payload['timestamp'] : undefined;
      const now = Date.now();
      const latencyMs =
        pingTimestamp != null && pingTimestamp <= now ? now - pingTimestamp : undefined;
      useConnectionStore.getState().recordHeartbeat(latencyMs);
      break;
    }
    case 'approval_request':
    case 'agent_failed':
    case 'emergency_stop':
    case 'task_completed':
    case 'agent_paused':
    case 'heartbeat_lost': {
      notifyCompanionMessage({ action, ...payload });
      break;
    }
    case 'dispatch_response': {
      const messageId = isString(payload['messageId'])
        ? payload['messageId']
        : `desktop-${Date.now()}`;
      const text = isString(payload['text']) ? payload['text'] : '';
      const taskStatus = isTaskStatus(payload['taskStatus']) ? payload['taskStatus'] : undefined;
      const statusDetail = isString(payload['statusDetail']) ? payload['statusDetail'] : undefined;
      const taskResult = isObject(payload['taskResult'])
        ? (payload['taskResult'] as TaskResult)
        : undefined;
      const dispatchMsg: DispatchMessage = {
        id: messageId,
        role: 'desktop',
        text,
        timestamp: new Date().toISOString(),
        taskStatus,
        statusDetail,
        taskResult,
      };
      useDispatchStore.getState().addMessage(dispatchMsg);
      break;
    }
    case 'dispatch_status_update': {
      const messageId = isString(payload['messageId']) ? payload['messageId'] : undefined;
      if (messageId) {
        const patch: Partial<Omit<DispatchMessage, 'id'>> = {};
        if (isTaskStatus(payload['taskStatus'])) patch.taskStatus = payload['taskStatus'];
        if (isString(payload['statusDetail'])) patch.statusDetail = payload['statusDetail'];
        if (isString(payload['text'])) patch.text = payload['text'];
        if (isObject(payload['taskResult'])) patch.taskResult = payload['taskResult'] as TaskResult;
        useDispatchStore.getState().updateMessage(messageId, patch);
      }
      break;
    }
    default:
      break;
  }
}

/**
 * Set up WebRTC peer connection for low-latency data channel communication.
 * Falls back to signaling relay if WebRTC fails.
 */
function setupPeerConnection(): void {
  cleanupPeerConnection();

  const config: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  const pc = new RTCPeerConnection(config);
  peerConnection = pc;

  // Handle ICE candidates — send to peer via signaling
  // react-native-webrtc uses on* callback style
  (pc as unknown as Record<string, unknown>).onicecandidate = (event: {
    candidate: RTCIceCandidate | null;
  }) => {
    if (event.candidate && signalingClient) {
      signalingClient.sendSignal('ice', {
        candidate: event.candidate.toJSON(),
      });
    }
  };

  // Handle incoming data channels from the desktop
  (pc as unknown as Record<string, unknown>).ondatachannel = (event: {
    channel: RTCDataChannelType;
  }) => {
    dataChannel = event.channel;
    if (dataChannel) {
      setupDataChannel(dataChannel);
    }
  };

  // Handle connection state changes
  (pc as unknown as Record<string, unknown>).onconnectionstatechange = () => {
    // Connection state change handled silently — reconnection logic in signaling layer
  };
}

/**
 * Configure data channel event handlers.
 */

function setupDataChannel(channel: RTCDataChannelType): void {
  const ch = channel as unknown as Record<string, unknown>;

  ch.onopen = () => {
    // DataChannel open — low-latency control active
  };

  ch.onmessage = (event: { data: string }) => {
    try {
      const parsed = JSON.parse(String(event.data));
      handleControlMessage(parsed);
    } catch {
      // Malformed DataChannel message — ignore
    }
  };

  ch.onclose = () => {
    // DataChannel closed
    dataChannel = null;
  };
}

/**
 * Handle WebRTC signaling messages (offer/answer/ice).
 */
async function handleSignalingMessage(kind: SignalKind, payload: unknown): Promise<void> {
  if (!peerConnection) return;
  const data = payload as Record<string, unknown>;

  try {
    switch (kind) {
      case 'offer': {
        const sdp = data['sdp'] as RTCSessionDescriptionInit;
        if (sdp) {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));

          const answer = await peerConnection.createAnswer();

          await peerConnection.setLocalDescription(answer);
          signalingClient?.sendSignal('answer', { sdp: answer });
        }
        break;
      }
      case 'answer': {
        const sdp = data['sdp'] as RTCSessionDescriptionInit;
        if (sdp) {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
        }
        break;
      }
      case 'ice': {
        const candidate = data['candidate'] as RTCIceCandidateInit;
        if (candidate) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
        break;
      }
      default:
        break;
    }
  } catch {
    // WebRTC signaling error — falls back to relay
  }
}

/**
 * Clean up WebRTC resources.
 */
function cleanupPeerConnection(): void {
  if (dataChannel) {
    try {
      dataChannel.close();
    } catch {
      // ignore
    }
    dataChannel = null;
  }
  if (peerConnection) {
    try {
      peerConnection.close();
    } catch {
      // ignore
    }
    peerConnection = null;
  }
}

/** Derive connection quality from heartbeat latency and missed heartbeats */
function deriveConnectionQuality(
  latencyMs: number | null,
  missedHeartbeats: number,
  status: ConnectionStatus,
): ConnectionQuality {
  if (status === 'disconnected' || status === 'error' || status === 'session_expired') {
    return 'disconnected';
  }
  if (missedHeartbeats >= 2 || status === 'stale') return 'disconnected';
  if (latencyMs === null) return 'weak'; // connected but no pong yet
  if (latencyMs < 200) return 'strong';
  if (latencyMs < 800) return 'weak';
  return 'disconnected';
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set, get) => ({
      status: 'disconnected',
      pairingCode: null,
      desktopName: null,
      desktopMetadata: null,
      error: null,
      sessionExpiresAt: null,
      lastHeartbeatAt: null,
      lastHeartbeatLatencyMs: null,
      missedHeartbeats: 0,
      reconnectCountdown: 0,
      connectionQuality: 'disconnected',
      reconnectAttempts: 0,
      reconnectSuccesses: 0,
      lastReconnectDurationMs: null,
      reconnectStartedAt: null,

      connect: (rawCode: string) => {
        // Clean up any existing connection
        const currentState = get();
        const isReconnect =
          currentState.status === 'stale' || currentState.status === 'reconnecting';
        if (currentState.status === 'connecting' || currentState.status === 'connected') {
          get().disconnect();
        }

        const code = parsePairingCode(rawCode);
        set((state) => ({
          status: 'connecting',
          pairingCode: code,
          error: null,
          desktopName: null,
          desktopMetadata: null,
          sessionExpiresAt: null,
          reconnectAttempts: isReconnect ? state.reconnectAttempts + 1 : state.reconnectAttempts,
          reconnectStartedAt: isReconnect ? Date.now() : state.reconnectStartedAt,
        }));

        // HIGH-MOB-05 fix (v2 nonce scheme 2026-05-05): derive the per-session
        // HMAC key from the pairing code + a random session salt via HKDF-SHA-256.
        // The salt is generated here so it is unique per connect() call (even on
        // reconnect with the same pairing code). The desktop derives the same key
        // when it receives the salt via the `registered` / `peer_ready` event
        // metadata field `dispatchSalt`. The salt is NOT secret — only the derived
        // key is. A fresh nonceCache is allocated for each session so replays from
        // a previous connection cannot be injected into the new session.
        const sessionSalt = Math.random().toString(36).slice(2) + Date.now().toString(36);
        deriveDispatchSecret(code, sessionSalt)
          .then((secret) => {
            hmacState = { secret, nonceCache: new Map() };
          })
          .catch((err) => {
            console.warn('[dispatch] HMAC secret derivation failed:', err);
            hmacState = null;
          });

        // Set up WebRTC
        setupPeerConnection();

        // Create signaling client (auto-connects on construction)
        signalingClient = new SignalingClient({
          wsUrl: WS_URL,
          code,
          role: 'mobile',
          metadata: {
            deviceType: 'mobile',
            app: 'agiworkforce-mobile',
            version: '0.1.0',
            // HIGH-MOB-05: broadcast the session salt so the desktop peer can
            // derive the same HMAC key via HKDF-SHA-256(salt, pairingCode).
            // The salt is NOT secret — the derived key is.
            dispatchSalt: sessionSalt,
          },
          heartbeatIntervalMs: 25000,
          onEvent: (event: SignalingEvent) => {
            switch (event.type) {
              case 'open':
                // WebSocket opened, waiting for registration confirmation
                break;

              case 'registered':
                set({ sessionExpiresAt: event.expiresAt });
                if (event.peerConnected) {
                  // Desktop is already connected — wait for peer_ready with metadata
                  set({ status: 'connecting' });
                }
                break;

              case 'peer_ready': {
                const metadata = (event.metadata ?? {}) as DesktopMetadata;
                const wasReconnecting =
                  get().status === 'reconnecting' ||
                  get().status === 'stale' ||
                  get().status === 'connecting';
                const reconnectStart = get().reconnectStartedAt;
                const reconnectDuration =
                  wasReconnecting && reconnectStart != null
                    ? Date.now() - reconnectStart
                    : get().lastReconnectDurationMs;

                set((state) => ({
                  status: 'connected',
                  desktopName: (metadata.deviceName as string) ?? 'Desktop',
                  desktopMetadata: metadata,
                  error: null,
                  lastHeartbeatAt: Date.now(),
                  missedHeartbeats: 0,
                  connectionQuality: 'weak', // will be updated on first pong with latency
                  reconnectSuccesses: wasReconnecting
                    ? state.reconnectSuccesses + 1
                    : state.reconnectSuccesses,
                  lastReconnectDurationMs: reconnectDuration,
                  reconnectStartedAt: null,
                }));

                // Flush any queued control messages now that we're reconnected
                flushPendingControlQueue();
                // Request a fresh agent state from desktop (don't assume stale state is current)
                useAgentStore.getState().setAgents([]);
                break;
              }

              case 'signal':
                if (event.kind === 'control') {
                  // Control message via signaling relay
                  handleControlMessage(event.payload);
                } else {
                  // WebRTC signaling (offer/answer/ice)
                  handleSignalingMessage(event.kind, event.payload).catch(() => {
                    // Signaling message handling failed — ignore
                  });
                }
                break;

              case 'peer_left':
                set({
                  status: 'disconnected',
                  desktopName: null,
                  desktopMetadata: null,
                });
                cleanupPeerConnection();
                // Clear agents when desktop disconnects
                useAgentStore.getState().setAgents([]);
                break;

              case 'session_expired':
                get().markSessionExpired();
                break;

              case 'terminated':
                set({
                  status: 'disconnected',
                  pairingCode: null,
                  desktopName: null,
                  desktopMetadata: null,
                });
                cleanupPeerConnection();
                signalingClient = null;
                break;

              case 'error':
                set({
                  status: 'error',
                  error: friendlyErrorMessage(event.error),
                });
                break;

              case 'close':
                // Only set disconnected if not already in error state
                if (get().status !== 'error') {
                  set({ status: 'disconnected' });
                }
                cleanupPeerConnection();
                signalingClient = null;
                break;
            }
          },
        });
      },

      recordHeartbeat: (latencyMs?: number) => {
        const currentStatus = get().status;
        const missed = 0;
        const quality = deriveConnectionQuality(
          latencyMs ?? get().lastHeartbeatLatencyMs,
          missed,
          currentStatus === 'stale' || currentStatus === 'reconnecting'
            ? 'connected'
            : currentStatus,
        );
        set({
          lastHeartbeatAt: Date.now(),
          missedHeartbeats: 0,
          lastHeartbeatLatencyMs: latencyMs ?? get().lastHeartbeatLatencyMs,
          connectionQuality: quality,
        });
        // If we were stale/reconnecting but got a heartbeat, restore connected
        if (currentStatus === 'stale' || currentStatus === 'reconnecting') {
          set({ status: 'connected' });
          // Flush queued control messages that piled up during disconnect
          flushPendingControlQueue();
          // Re-sync agent state from desktop
          useAgentStore.getState().setAgents([]);
        }
      },

      markStale: () => {
        const current = get();
        if (current.status !== 'connected' && current.status !== 'stale') return;
        const missed = current.missedHeartbeats + 1;
        set({
          missedHeartbeats: missed,
          connectionQuality: missed >= 1 ? 'weak' : current.connectionQuality,
        });
        if (missed >= 2) {
          set({ status: 'stale', connectionQuality: 'disconnected' });
        }
      },

      queueControl: (action: string, payload?: unknown) => {
        if (pendingControlQueue.length >= MAX_PENDING_QUEUE) {
          pendingControlQueue.shift(); // Drop oldest to stay under cap
        }
        pendingControlQueue.push({ action, payload: payload ?? {} });
      },

      beginReconnecting: (countdownSeconds: number) => {
        set((state) => ({
          status: 'reconnecting',
          reconnectCountdown: countdownSeconds,
          connectionQuality: 'disconnected',
          reconnectStartedAt: state.reconnectStartedAt ?? Date.now(),
        }));
      },

      tickReconnectCountdown: () => {
        const current = get();
        if (current.reconnectCountdown <= 1) {
          set({ reconnectCountdown: 0 });
        } else {
          set({ reconnectCountdown: current.reconnectCountdown - 1 });
        }
      },

      markSessionExpired: () => {
        // Clear any queued messages — session is gone
        pendingControlQueue.length = 0;
        set({
          status: 'session_expired',
          error: 'Pairing session expired. Please scan a new QR code.',
          pairingCode: null,
          connectionQuality: 'disconnected',
          reconnectStartedAt: null,
        });
        cleanupPeerConnection();
        signalingClient = null;
      },

      disconnect: () => {
        if (signalingClient) {
          signalingClient.close();
          signalingClient = null;
        }
        cleanupPeerConnection();
        // HIGH-MOB-05: clear HMAC session state on disconnect
        hmacState = null;
        // Clear pending queue on intentional disconnect
        pendingControlQueue.length = 0;
        set({
          status: 'disconnected',
          pairingCode: null,
          desktopName: null,
          desktopMetadata: null,
          error: null,
          sessionExpiresAt: null,
          lastHeartbeatAt: null,
          lastHeartbeatLatencyMs: null,
          missedHeartbeats: 0,
          reconnectCountdown: 0,
          connectionQuality: 'disconnected',
          reconnectStartedAt: null,
        });
        // Clear agents on disconnect
        useAgentStore.getState().setAgents([]);
      },

      sendControl: (action: string, payload?: unknown) => {
        const { status } = get();
        const innerPayload = { action, ...(payload ?? {}) };

        // If disconnecting or reconnecting, queue for later delivery instead of dropping
        if (status === 'reconnecting' || status === 'stale') {
          if (pendingControlQueue.length < MAX_PENDING_QUEUE) {
            pendingControlQueue.push({ action, payload: payload ?? {} });
          }
          return;
        }

        // Cannot send when fully disconnected or session expired — silently no-op
        if (status === 'disconnected' || status === 'error' || status === 'session_expired') {
          return;
        }

        // HIGH-MOB-05 fix (v2 nonce scheme 2026-05-05): sign the outgoing
        // control message when HMAC state is available. signMessage() produces
        // the canonical envelope { hmac, nonce, payload, ts, type } that the
        // desktop peer verifies. Falls back to unsigned send when hmacState is
        // null (pre-derivation race; extremely narrow window at connect start).
        const sendRaw = (envelope: unknown) => {
          const serialised = JSON.stringify(envelope);
          // Prefer data channel for low latency
          if (dataChannel && dataChannel.readyState === 'open') {
            try {
              dataChannel.send(serialised);
              return;
            } catch {
              // Fall through to signaling relay
            }
          }
          if (signalingClient) {
            signalingClient.sendSignal('control', envelope);
          }
        };

        if (hmacState) {
          // New signature: signMessage(state, type, payload)
          signMessage(hmacState, action, innerPayload)
            .then(sendRaw)
            .catch((err) => {
              console.warn('[dispatch] Failed to sign control message:', err);
            });
        } else {
          sendRaw(innerPayload);
        }
      },

      clearError: () => {
        set({ error: null });
        if (get().status === 'error') {
          set({ status: 'disconnected' });
        }
      },
    }),
    {
      name: 'connection-store',
      storage: createJSONStorage(() => mmkvStorage),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[connectionStore] Hydration failed:', error);
      },
      partialize: (state) => ({
        // Do NOT persist pairingCode — it's ephemeral and sensitive
        // Do NOT persist connection status or metadata
        desktopName: state.desktopName,
      }),
    },
  ),
);

/**
 * Convert raw signaling error strings to user-friendly messages.
 */
function friendlyErrorMessage(raw: string): string {
  switch (raw) {
    case 'connection_error':
      return 'Unable to reach the pairing server. Check your connection.';
    case 'connection_closed':
      return 'Connection to pairing server lost.';
    case 'invalid_code':
      return 'Invalid pairing code. Please try again.';
    case 'session_full':
      return 'This pairing session already has two devices connected.';
    case 'rate_limited':
      return 'Too many attempts. Please wait a moment.';
    default:
      return raw || 'An unexpected error occurred.';
  }
}
