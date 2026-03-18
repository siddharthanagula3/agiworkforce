import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/mmkv';
import { SignalingClient } from '@agiworkforce/utils';
import type { SignalingEvent, SignalKind } from '@agiworkforce/types';
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } from 'react-native-webrtc';

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

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

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
  /** Active pairing code (6-8 chars extracted from QR) */
  pairingCode: string | null;
  /** Desktop device name from peer metadata */
  desktopName: string | null;
  /** Full desktop metadata (version, platform, etc.) */
  desktopMetadata: DesktopMetadata | null;
  /** Human-readable error message when status is 'error' */
  error: string | null;
  /** Session expiry timestamp (ms since epoch) */
  sessionExpiresAt: number | null;

  // --- Actions ---
  connect: (code: string) => void;
  disconnect: () => void;
  sendControl: (action: string, payload?: unknown) => void;
  clearError: () => void;
}

/** Signaling client instance — kept outside state to avoid serialization */
let signalingClient: SignalingClient | null = null;

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
 */
function parsePairingCode(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('agiw:')) {
    return trimmed.slice(5);
  }
  return trimmed;
}

/**
 * Handle incoming control messages from the desktop via signaling or data channel.
 */
function handleControlMessage(payload: unknown): void {
  if (typeof payload !== 'object' || payload === null) return;
  const msg = payload as Record<string, unknown>;
  const action = msg['action'] as string | undefined;

  switch (action) {
    case 'agents_update': {
      const agents = msg['agents'];
      if (Array.isArray(agents)) {
        useAgentStore.getState().setAgents(agents as Agent[]);
      }
      break;
    }
    case 'agent_update': {
      const agentId = msg['agentId'] as string | undefined;
      const patch = msg['patch'] as Partial<Omit<Agent, 'id'>> | undefined;
      if (agentId && patch) {
        useAgentStore.getState().updateAgent(agentId, patch);
      }
      break;
    }
    case 'agent_removed': {
      const agentId = msg['agentId'] as string | undefined;
      if (agentId) {
        useAgentStore.getState().removeAgent(agentId);
      }
      break;
    }
    default:
      // Unknown control action — ignore
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
    const state = pc.connectionState;
    if (state === 'failed' || state === 'disconnected') {
      console.warn('[companion] WebRTC connection state:', state);
    }
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
      console.warn('[companion] Failed to parse DataChannel message');
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
  } catch (error) {
    console.warn('[companion] WebRTC signaling error:', error);
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

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set, get) => ({
      status: 'disconnected',
      pairingCode: null,
      desktopName: null,
      desktopMetadata: null,
      error: null,
      sessionExpiresAt: null,

      connect: (rawCode: string) => {
        // Clean up any existing connection
        const currentState = get();
        if (currentState.status === 'connecting' || currentState.status === 'connected') {
          get().disconnect();
        }

        const code = parsePairingCode(rawCode);
        set({
          status: 'connecting',
          pairingCode: code,
          error: null,
          desktopName: null,
          desktopMetadata: null,
          sessionExpiresAt: null,
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
                set({
                  status: 'connected',
                  desktopName: (metadata.deviceName as string) ?? 'Desktop',
                  desktopMetadata: metadata,
                  error: null,
                });
                break;
              }

              case 'signal':
                if (event.kind === 'control') {
                  // Control message via signaling relay
                  handleControlMessage(event.payload);
                } else {
                  // WebRTC signaling (offer/answer/ice)
                  handleSignalingMessage(event.kind, event.payload).catch((err) =>
                    console.warn('[companion] Signaling message error:', err),
                  );
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
                set({
                  status: 'error',
                  error: 'Pairing session expired. Please scan a new QR code.',
                  pairingCode: null,
                });
                cleanupPeerConnection();
                signalingClient = null;
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

      disconnect: () => {
        if (signalingClient) {
          signalingClient.close();
          signalingClient = null;
        }
        cleanupPeerConnection();
        set({
          status: 'disconnected',
          pairingCode: null,
          desktopName: null,
          desktopMetadata: null,
          error: null,
          sessionExpiresAt: null,
        });
        // Clear agents on disconnect
        useAgentStore.getState().setAgents([]);
      },

      sendControl: (action: string, payload?: unknown) => {
        const message = { action, payload: payload ?? {} };

        // Prefer data channel for low latency
        if (dataChannel && dataChannel.readyState === 'open') {
          try {
            dataChannel.send(JSON.stringify(message));
            return;
          } catch {
            // Fall through to signaling relay
          }
        }

        // Fallback: send via signaling server
        if (signalingClient) {
          signalingClient.sendSignal('control', message);
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
      partialize: (state) => ({
        // Only persist the pairing code for reconnection
        // Do NOT persist connection status or metadata
        pairingCode: state.pairingCode,
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
