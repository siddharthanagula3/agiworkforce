import {
  SignalingClient,
  type SignalingClientOptions,
  type SignalingEvent,
} from '@agiworkforce/utils';
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import {
  initDispatchSession,
  resetDispatchSession,
  extractDispatchSalt,
  signOutbound,
  verifyInbound,
} from '../services/dispatch';
import { API_BASE_URL } from '../api/config';
import { guardedFetch } from '../lib/egressGuard';
import { cloudAccountAuth } from '../services/cloudAccountAuth';

const MAX_CONTROL_MESSAGE_BYTES = 64 * 1024;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
];

export type CompanionStatus = 'idle' | 'requesting' | 'waiting' | 'pairing' | 'streaming' | 'error';

interface MobileCompanionState {
  status: CompanionStatus;
  pairingCode: string | null;
  expiresAt: number | null;
  qrData: string | null;
  wsUrl: string | null;
  error: string | null;
  stream: MediaStream | null;
  peerConnected: boolean;
  requestPairingCode: () => Promise<void>;
  stopSession: () => void;
  clearError: () => void;
}

interface PairingResponse {
  code: string;
  expiresAt: number;
  expiresIn: number;
  qrData: string;
  signaling: {
    httpUrl: string;
    wsUrl: string;
  };
  pairTokens: {
    desktop: string;
    mobile: string;
  };
}

let signalingClient: SignalingClient | null = null;
let peerConnection: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let controlChannel: RTCDataChannel | null = null;

interface MobileControlMessage {
  action: string;
  payload: Record<string, unknown>;
  rawJson: string;
  id?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSignedEnvelope(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value['hmac'] === 'string';
}

function safeControlJson(input: unknown): string | null {
  if (typeof input === 'string') {
    return input.length <= MAX_CONTROL_MESSAGE_BYTES ? input : null;
  }

  try {
    const json = JSON.stringify(input);
    return json.length <= MAX_CONTROL_MESSAGE_BYTES ? json : null;
  } catch {
    return null;
  }
}

function parseJsonObject(rawJson: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(rawJson);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractMobileControlMessage(input: unknown): MobileControlMessage | null {
  const outerJson = safeControlJson(input);
  if (!outerJson) return null;

  const outer = parseJsonObject(outerJson);
  if (!outer) return null;

  const candidate =
    isRecord(outer['data']) && isSignedEnvelope(outer['data']) ? outer['data'] : outer;
  const rawJson = safeControlJson(candidate);
  if (!rawJson) return null;

  const signed = isSignedEnvelope(candidate);
  const payload = signed && isRecord(candidate['payload']) ? candidate['payload'] : candidate;
  const action =
    (typeof payload['action'] === 'string' && payload['action']) ||
    (typeof candidate['type'] === 'string' && candidate['type']) ||
    (typeof outer['action'] === 'string' && outer['action']);

  if (!action || !isRecord(payload)) return null;

  const id =
    (typeof payload['id'] === 'string' && payload['id']) ||
    (typeof payload['requestId'] === 'string' && payload['requestId']) ||
    (typeof candidate['nonce'] === 'string' && candidate['nonce']) ||
    undefined;

  return { action, payload, rawJson, id };
}

async function sendControlToMobile(action: string, payload: Record<string, unknown>) {
  try {
    const signedJson = await signOutbound({ ...payload, action }, action);
    if (controlChannel?.readyState === 'open') {
      controlChannel.send(signedJson);
      return;
    }

    const signedPayload = parseJsonObject(signedJson);
    if (signedPayload && signalingClient) {
      signalingClient.sendSignal('control', signedPayload);
    }
  } catch (error) {
    console.warn('[mobile-companion] failed to send signed control response:', error);
  }
}

async function handleMobileControlPayload(input: unknown) {
  const message = extractMobileControlMessage(input);
  if (!message) {
    console.warn('[mobile-companion] ignored malformed control message');
    return;
  }

  const verifyResult = await verifyInbound({ rawJson: message.rawJson, id: message.id });
  if (!verifyResult.ok) {
    console.warn('[mobile-companion] rejected control message:', verifyResult.reason);
    return;
  }

  if (message.action === 'heartbeat') {
    await sendControlToMobile('heartbeat_ack', {
      timestamp:
        typeof message.payload['timestamp'] === 'number'
          ? message.payload['timestamp']
          : Date.now(),
      receivedAt: Date.now(),
    });
    return;
  }

  window.dispatchEvent(
    new CustomEvent('mobile-companion:control', {
      detail: {
        action: message.action,
        payload: message.payload,
      },
    }),
  );
}

const IDLE_CONNECTION_STATE: Partial<MobileCompanionState> = {
  status: 'idle',
  pairingCode: null,
  qrData: null,
  wsUrl: null,
  expiresAt: null,
  stream: null,
  peerConnected: false,
};

export const useConnectionStore = create<MobileCompanionState>()(
  devtools(
    subscribeWithSelector((set, get) => {
      const resetConnection = () => {
        // Close signaling client
        if (signalingClient) {
          try {
            signalingClient.close();
          } catch (error) {
            console.warn('[mobile-companion] Error closing signaling client:', error);
          }
          signalingClient = null;
        }

        // Close data channel
        if (controlChannel) {
          try {
            controlChannel.close();
          } catch (error) {
            console.warn('[mobile-companion] Error closing control channel:', error);
          }
          controlChannel = null;
        }

        // Close peer connection
        if (peerConnection) {
          try {
            peerConnection.close();
          } catch (error) {
            console.warn('[mobile-companion] Error closing peer connection:', error);
          }
          peerConnection = null;
        }

        // Stop all media tracks and release the stream
        if (localStream) {
          try {
            localStream.getTracks().forEach((track) => {
              try {
                track.stop();
              } catch (error) {
                console.warn('[mobile-companion] Error stopping track:', error);
              }
            });
          } catch (error) {
            console.warn('[mobile-companion] Error stopping media tracks:', error);
          }
          localStream = null;
        }
      };

      const handleControlEvent = (message: MessageEvent<string>) => {
        handleMobileControlPayload(message.data).catch((error) => {
          console.warn('[mobile-companion] control message handling failed:', error);
        });
      };

      const handleSignalingEvent = async (event: SignalingEvent) => {
        switch (event.type) {
          case 'registered':
            set({
              status: 'waiting',
              expiresAt: event.expiresAt,
              peerConnected: event.peerConnected,
              error: null,
            });
            break;
          case 'peer_ready': {
            set({ peerConnected: true, status: 'pairing' });

            // Initialise HMAC session key from the salt mobile sent in metadata.
            const saltInfo = extractDispatchSalt(event.metadata);
            if (saltInfo) {
              const pairingCode = get().pairingCode;
              if (pairingCode) {
                initDispatchSession(pairingCode, saltInfo.salt, saltInfo.version).catch((err) => {
                  console.warn('[dispatch] session init failed:', err);
                });
              } else {
                console.warn('[dispatch] peer_ready received but pairingCode is null');
              }
            } else {
              console.warn(
                '[dispatch] peer_ready metadata missing dispatchSalt — ' +
                  'mobile may need update before 2026-06-05 cutoff.',
              );
            }

            await establishPeerConnection();
            break;
          }
          case 'signal':
            if (!peerConnection) {
              console.warn('[mobile-companion] received signal without peer connection');
              return;
            }
            if (event.kind === 'answer') {
              await peerConnection.setRemoteDescription(
                new RTCSessionDescription(event.payload as RTCSessionDescriptionInit),
              );
            } else if (event.kind === 'ice' && event.payload) {
              const candidate = new RTCIceCandidate(event.payload as RTCIceCandidateInit);
              await peerConnection.addIceCandidate(candidate);
            } else if (event.kind === 'control') {
              handleMobileControlPayload(event.payload).catch((error) => {
                console.warn('[mobile-companion] relayed control handling failed:', error);
              });
            }
            break;
          case 'peer_left':
            set({ peerConnected: false });
            resetDispatchSession().catch((e) =>
              console.warn('[connection] dispatch reset failed:', e),
            );
            break;
          case 'session_expired':
          case 'terminated':
            resetConnection();
            set(IDLE_CONNECTION_STATE);
            resetDispatchSession().catch((e) =>
              console.warn('[connection] dispatch reset failed:', e),
            );
            break;
          case 'error':
            set({ status: 'error', error: event.error });
            break;
          case 'close':
            if (get().status !== 'idle') {
              set(IDLE_CONNECTION_STATE);
            }
            break;
          default:
            break;
        }
      };

      const establishPeerConnection = async () => {
        if (!signalingClient) {
          set({ status: 'error', error: 'signaling_unavailable' });
          return;
        }

        try {
          if (!localStream) {
            localStream = await acquireDisplayStream();
            set({ stream: localStream });
          }

          peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
          peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
              signalingClient?.sendSignal('ice', event.candidate);
            }
          };
          peerConnection.onconnectionstatechange = () => {
            const state = peerConnection?.connectionState;
            if (state === 'connected') {
              set({ status: 'streaming' });
            } else if (state === 'disconnected' || state === 'failed') {
              set({ status: 'error', error: 'peer_connection_lost' });
              get().stopSession();
            }
          };

          controlChannel = peerConnection.createDataChannel('control', { ordered: true });
          controlChannel.onmessage = handleControlEvent;

          localStream
            .getTracks()
            .forEach((track) => peerConnection?.addTrack(track, localStream as MediaStream));

          const offer = await peerConnection.createOffer({
            offerToReceiveVideo: false,
            offerToReceiveAudio: false,
          });
          await peerConnection.setLocalDescription(offer);
          signalingClient.sendSignal('offer', offer);
        } catch (error) {
          console.error('[mobile-companion] failed to establish peer connection', error);
          set({
            status: 'error',
            error: error instanceof Error ? error.message : 'peer_initialization_failed',
          });
        }
      };

      const acquireDisplayStream = async (): Promise<MediaStream> => {
        try {
          if (navigator.mediaDevices?.getDisplayMedia) {
            return await navigator.mediaDevices.getDisplayMedia({
              video: {
                frameRate: 15,
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
              audio: false,
            });
          }
        } catch (error) {
          console.warn(
            '[mobile-companion] display capture unavailable, falling back to window capture',
            error,
          );
        }
        return navigator.mediaDevices.getUserMedia({
          video: {
            frameRate: 15,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      };

      const requestPairingCode = async () => {
        if (signalingClient) {
          signalingClient.close();
          signalingClient = null;
        }
        set({
          status: 'requesting',
          error: null,
          pairingCode: null,
          qrData: null,
          expiresAt: null,
          peerConnected: false,
          stream: null,
          wsUrl: null,
        });
        try {
          const session = cloudAccountAuth.getSession();
          if (!session?.access_token) {
            throw new Error('Sign in to pair a mobile companion.');
          }

          // Mobile pairing is a managed-cloud (cross-device sync) operation.
          // Route through the egress guard so it fails closed in Local/BYOK mode
          // instead of reaching our signaling/gateway. (Trust-boundary chokepoint.)
          const response = await guardedFetch(
            `${API_BASE_URL.replace(/\/+$/, '')}/api/pair/initiate`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
                'X-Requested-With': 'XMLHttpRequest',
              },
              body: JSON.stringify({
                initiator: 'desktop',
              }),
            },
          );
          if (!response.ok) {
            throw new Error(`Failed to create pairing (${response.status})`);
          }
          const payload = (await response.json()) as PairingResponse;
          signalingClient = new SignalingClient({
            wsUrl: payload.signaling.wsUrl,
            code: payload.code,
            role: 'desktop',
            pairToken: payload.pairTokens.desktop,
            metadata: {
              platform: 'desktop',
            },
            onEvent: handleSignalingEvent,
          } satisfies SignalingClientOptions);

          set({
            status: 'waiting',
            pairingCode: payload.code,
            expiresAt: payload.expiresAt,
            qrData: payload.qrData,
            wsUrl: payload.signaling.wsUrl,
            peerConnected: false,
            stream: null,
            error: null,
          });
        } catch (error) {
          console.error('[mobile-companion] failed to request pairing code', error);
          set({
            status: 'error',
            error: error instanceof Error ? error.message : 'pairing_request_failed',
          });
        }
      };

      const stopSession = () => {
        resetConnection();
        set({ ...IDLE_CONNECTION_STATE, error: null });
      };

      const clearError = () =>
        set({ error: null, status: get().status === 'error' ? 'idle' : get().status });

      return {
        status: 'idle',
        pairingCode: null,
        expiresAt: null,
        qrData: null,
        wsUrl: null,
        error: null,
        stream: null,
        peerConnected: false,
        requestPairingCode,
        stopSession,
        clearError,
      };
    }),
    { name: 'ConnectionStore', enabled: import.meta.env.DEV },
  ),
);
