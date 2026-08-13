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
  isDispatchSessionActive,
  signOutbound,
  verifyInbound,
} from '../services/dispatch';
import { GATEWAY_BASE_URL } from '../api/config';
import { isDesktopUiDevLocal } from '../lib/runtimeEnvironment';
import { selectPrivacyMode, useAppModeStore } from './appModeStore';
import { selectHasCloudAccountSession, useAuthStore } from './auth';
import {
  assertManagedCloudBoundary,
  type ManagedCloudBoundary,
} from '../services/managedCloudBoundary';
import { createManagedCloudRequestContext } from '../services/managedCloudRequestContext';

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
let pairingAbortController: AbortController | null = null;
let connectionGeneration = 0;
let peerControlGeneration = 0;
let activeManagedBoundary: ManagedCloudBoundary | null = null;

export const MOBILE_COMPANION_SESSION_ENDED_EVENT = 'mobile-companion:session-ended';

function isCurrentManagedGeneration(generation: number, boundary: ManagedCloudBoundary): boolean {
  if (generation !== connectionGeneration || activeManagedBoundary !== boundary) {
    return false;
  }

  try {
    assertManagedCloudBoundary(boundary);
    return true;
  } catch {
    return false;
  }
}

function publishCompanionSessionEnded(): void {
  if (typeof window !== 'undefined') {
    // EventTarget dispatch is synchronous. The Cowork runtime uses this to
    // discard request/task mappings before a replacement account can pair.
    window.dispatchEvent(new Event(MOBILE_COMPANION_SESSION_ENDED_EVENT));
  }
}

interface MobileControlMessage {
  action: string;
  payload: Record<string, unknown>;
  rawJson: string;
  id?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasAllowedUrlProtocol(value: unknown, protocols: readonly string[]): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2_048) return false;
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function parsePairingResponse(value: unknown): PairingResponse | null {
  if (!isRecord(value) || !isRecord(value['signaling']) || !isRecord(value['pairTokens'])) {
    return null;
  }

  const code = value['code'];
  const expiresAt = value['expiresAt'];
  const expiresIn = value['expiresIn'];
  const qrData = value['qrData'];
  const httpUrl = value['signaling']['httpUrl'];
  const wsUrl = value['signaling']['wsUrl'];
  const desktopToken = value['pairTokens']['desktop'];
  const mobileToken = value['pairTokens']['mobile'];
  if (
    typeof code !== 'string' ||
    code.length < 8 ||
    code.length > 128 ||
    typeof expiresAt !== 'number' ||
    !Number.isFinite(expiresAt) ||
    typeof expiresIn !== 'number' ||
    !Number.isFinite(expiresIn) ||
    typeof qrData !== 'string' ||
    qrData.length > 16_384 ||
    !hasAllowedUrlProtocol(httpUrl, ['http:', 'https:']) ||
    !hasAllowedUrlProtocol(wsUrl, ['ws:', 'wss:']) ||
    typeof desktopToken !== 'string' ||
    desktopToken.length === 0 ||
    desktopToken.length > 16_384 ||
    typeof mobileToken !== 'string' ||
    mobileToken.length === 0 ||
    mobileToken.length > 16_384
  ) {
    return null;
  }

  return {
    code,
    expiresAt,
    expiresIn,
    qrData,
    signaling: { httpUrl, wsUrl },
    pairTokens: { desktop: desktopToken, mobile: mobileToken },
  };
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

export async function sendCompanionControl(
  action: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const boundary = activeManagedBoundary;
  if (!boundary) return false;
  try {
    assertManagedCloudBoundary(boundary);
  } catch {
    return false;
  }

  if (
    !isDispatchSessionActive() ||
    (controlChannel?.readyState !== 'open' && signalingClient === null)
  ) {
    return false;
  }

  const generation = peerControlGeneration;
  const sessionControlChannel = controlChannel;
  const sessionSignalingClient = signalingClient;

  try {
    const signedJson = await signOutbound({ ...payload, action }, action);
    if (
      peerControlGeneration !== generation ||
      activeManagedBoundary !== boundary ||
      !isDispatchSessionActive()
    ) {
      return false;
    }
    try {
      assertManagedCloudBoundary(boundary);
    } catch {
      return false;
    }
    if (sessionControlChannel?.readyState === 'open' && controlChannel === sessionControlChannel) {
      sessionControlChannel.send(signedJson);
      return true;
    }

    const signedPayload = parseJsonObject(signedJson);
    if (signedPayload && sessionSignalingClient && signalingClient === sessionSignalingClient) {
      return sessionSignalingClient.sendSignal('control', signedPayload);
    }
  } catch (error) {
    console.warn('[mobile-companion] failed to send signed control response:', error);
  }
  return false;
}

async function handleMobileControlPayload(
  input: unknown,
  isCurrentSession: () => boolean = () => activeManagedBoundary !== null,
) {
  if (!isCurrentSession()) return;

  const message = extractMobileControlMessage(input);
  if (!message) {
    console.warn('[mobile-companion] ignored malformed control message');
    return;
  }

  const verifyResult = await verifyInbound({ rawJson: message.rawJson, id: message.id });
  if (!isCurrentSession()) return;
  if (!verifyResult.ok) {
    console.warn('[mobile-companion] rejected control message:', verifyResult.reason);
    return;
  }

  if (message.action === 'heartbeat') {
    if (!isCurrentSession()) return;
    await sendCompanionControl('heartbeat_ack', {
      timestamp:
        typeof message.payload['timestamp'] === 'number'
          ? message.payload['timestamp']
          : Date.now(),
      receivedAt: Date.now(),
    });
    return;
  }

  if (!isCurrentSession()) return;
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
      const resetRemoteDispatch = () => {
        // resetDispatchSession now revokes its in-memory authority before its
        // native cleanup awaits, so no control can cross a boundary transition.
        void resetDispatchSession().catch((error) =>
          console.warn('[connection] dispatch reset failed:', error),
        );
        publishCompanionSessionEnded();
      };

      const closePeerTransport = () => {
        if (controlChannel) {
          try {
            controlChannel.close();
          } catch (error) {
            console.warn('[mobile-companion] Error closing control channel:', error);
          }
          controlChannel = null;
        }

        if (peerConnection) {
          try {
            peerConnection.close();
          } catch (error) {
            console.warn('[mobile-companion] Error closing peer connection:', error);
          }
          peerConnection = null;
        }
      };

      const retirePeerControlSession = (): number => {
        peerControlGeneration += 1;
        closePeerTransport();
        return peerControlGeneration;
      };

      const resetConnection = () => {
        connectionGeneration += 1;
        activeManagedBoundary = null;
        retirePeerControlSession();

        if (pairingAbortController) {
          pairingAbortController.abort();
          pairingAbortController = null;
        }

        // Close signaling client
        if (signalingClient) {
          try {
            signalingClient.close();
          } catch (error) {
            console.warn('[mobile-companion] Error closing signaling client:', error);
          }
          signalingClient = null;
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

        resetRemoteDispatch();
      };

      const handleSignalingEvent = async (
        event: SignalingEvent,
        generation: number,
        boundary: ManagedCloudBoundary,
      ) => {
        const isCurrentSession = () => isCurrentManagedGeneration(generation, boundary);
        if (!isCurrentSession()) return;

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
            const replacingPeer = controlChannel !== null || peerConnection !== null;
            const peerGeneration = retirePeerControlSession();
            const isCurrentPeerSession = () =>
              isCurrentSession() && peerGeneration === peerControlGeneration;
            if (replacingPeer) resetRemoteDispatch();
            if (!isCurrentPeerSession()) return;
            set({ peerConnected: true, status: 'pairing' });

            // Initialise HMAC session key from the salt mobile sent in metadata.
            const saltInfo = extractDispatchSalt(event.metadata);
            if (saltInfo) {
              const pairingCode = get().pairingCode;
              if (pairingCode) {
                try {
                  await initDispatchSession(pairingCode, saltInfo.salt, saltInfo.version);
                  if (!isCurrentPeerSession()) return;
                } catch (error) {
                  if (!isCurrentPeerSession()) return;
                  console.warn('[dispatch] session init failed:', error);
                }
              } else {
                console.warn('[dispatch] peer_ready received but pairingCode is null');
              }
            } else {
              console.warn(
                '[dispatch] peer_ready metadata missing dispatchSalt — ' +
                  'mobile may need update before 2026-06-05 cutoff.',
              );
            }

            if (!isCurrentPeerSession()) return;
            await establishPeerConnection(generation, boundary, peerGeneration);
            break;
          }
          case 'signal': {
            const peerGeneration = peerControlGeneration;
            const sessionPeerConnection = peerConnection;
            const isCurrentPeerSession = () =>
              isCurrentSession() &&
              peerGeneration === peerControlGeneration &&
              peerConnection === sessionPeerConnection;
            if (!isCurrentPeerSession()) return;
            if (!sessionPeerConnection) {
              console.warn('[mobile-companion] received signal without peer connection');
              return;
            }
            if (event.kind === 'answer') {
              await sessionPeerConnection.setRemoteDescription(
                new RTCSessionDescription(event.payload as RTCSessionDescriptionInit),
              );
              if (!isCurrentPeerSession()) return;
            } else if (event.kind === 'ice' && event.payload) {
              const candidate = new RTCIceCandidate(event.payload as RTCIceCandidateInit);
              await sessionPeerConnection.addIceCandidate(candidate);
              if (!isCurrentPeerSession()) return;
            } else if (event.kind === 'control') {
              handleMobileControlPayload(event.payload, isCurrentPeerSession).catch((error) => {
                console.warn('[mobile-companion] relayed control handling failed:', error);
              });
            }
            break;
          }
          case 'peer_left':
            retirePeerControlSession();
            set({ peerConnected: false, status: 'waiting' });
            resetRemoteDispatch();
            break;
          case 'session_expired':
          case 'terminated':
            resetConnection();
            set(IDLE_CONNECTION_STATE);
            break;
          case 'error':
            set({ status: 'error', error: event.error });
            break;
          case 'close':
            if (get().status !== 'idle') {
              resetConnection();
              set(IDLE_CONNECTION_STATE);
            }
            break;
          default:
            break;
        }
      };

      const establishPeerConnection = async (
        generation: number,
        boundary: ManagedCloudBoundary,
        peerGeneration: number,
      ) => {
        const isCurrentSession = () =>
          isCurrentManagedGeneration(generation, boundary) &&
          peerGeneration === peerControlGeneration;
        const sessionSignalingClient = signalingClient;
        if (!sessionSignalingClient || !isCurrentSession()) {
          if (!isCurrentSession()) return;
          set({ status: 'error', error: 'signaling_unavailable' });
          return;
        }

        try {
          if (!localStream) {
            const acquiredStream = await acquireDisplayStream();
            if (!isCurrentSession()) {
              acquiredStream.getTracks().forEach((track) => track.stop());
              return;
            }
            localStream = acquiredStream;
            set({ stream: acquiredStream });
          }

          if (!isCurrentSession()) return;
          const sessionPeerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
          peerConnection = sessionPeerConnection;
          sessionPeerConnection.onicecandidate = (event) => {
            if (
              event.candidate &&
              isCurrentSession() &&
              signalingClient === sessionSignalingClient &&
              peerConnection === sessionPeerConnection
            ) {
              sessionSignalingClient.sendSignal('ice', event.candidate);
            }
          };
          sessionPeerConnection.onconnectionstatechange = () => {
            if (!isCurrentSession() || peerConnection !== sessionPeerConnection) return;
            const state = sessionPeerConnection.connectionState;
            if (state === 'connected') {
              set({ status: 'streaming' });
            } else if (state === 'disconnected' || state === 'failed') {
              set({ status: 'error', error: 'peer_connection_lost' });
              get().stopSession();
            }
          };

          const sessionControlChannel = sessionPeerConnection.createDataChannel('control', {
            ordered: true,
          });
          controlChannel = sessionControlChannel;
          sessionControlChannel.onmessage = (message: MessageEvent<string>) => {
            handleMobileControlPayload(message.data, isCurrentSession).catch((error) => {
              console.warn('[mobile-companion] control message handling failed:', error);
            });
          };

          const sessionStream = localStream;
          if (!sessionStream || !isCurrentSession()) return;
          sessionStream
            .getTracks()
            .forEach((track) => sessionPeerConnection.addTrack(track, sessionStream));

          const offer = await sessionPeerConnection.createOffer({
            offerToReceiveVideo: false,
            offerToReceiveAudio: false,
          });
          if (!isCurrentSession()) return;
          await sessionPeerConnection.setLocalDescription(offer);
          if (
            !isCurrentSession() ||
            signalingClient !== sessionSignalingClient ||
            peerConnection !== sessionPeerConnection
          ) {
            return;
          }
          sessionSignalingClient.sendSignal('offer', offer);
        } catch (error) {
          if (!isCurrentSession()) return;
          console.error('[mobile-companion] failed to establish peer connection', error);
          resetConnection();
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
        resetConnection();
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
        if (isDesktopUiDevLocal) {
          set({
            status: 'waiting',
            pairingCode: 'AGI2DEV4PAIR',
            expiresAt: Date.now() + 10 * 60 * 1000,
            qrData: 'agiworkforce-ui-preview:AGI2DEV4PAIR',
            wsUrl: null,
            peerConnected: false,
            stream: null,
            error: null,
          });
          return;
        }

        let attemptGeneration: number | null = null;
        let attemptBoundary: ManagedCloudBoundary | null = null;
        let attemptAbortController: AbortController | null = null;
        try {
          const requestContext = createManagedCloudRequestContext('Mobile companion pairing');
          attemptGeneration = ++connectionGeneration;
          attemptBoundary = requestContext.boundary;
          activeManagedBoundary = requestContext.boundary;
          attemptAbortController = new AbortController();
          pairingAbortController = attemptAbortController;
          const isCurrentAttempt = () =>
            isCurrentManagedGeneration(attemptGeneration as number, requestContext.boundary);

          const authHeaders = await requestContext.getHeaders();
          if (!isCurrentAttempt()) return;

          // Mobile pairing is a managed-cloud (cross-device sync) operation.
          // Route through the egress guard so it fails closed in Local/BYOK mode
          // instead of reaching our signaling/gateway. (Trust-boundary chokepoint.)
          //
          // STB-8: /api/pair/* is served only by the Express api-gateway, so this
          // must target GATEWAY_BASE_URL. Sending it to the Next.js origin 404'd
          // and the QR code never rendered unless VITE_API_BASE_URL happened to
          // be overridden at build time.
          const response = await requestContext.fetch(
            `${GATEWAY_BASE_URL.replace(/\/+$/, '')}/api/pair/initiate`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...authHeaders,
                'X-Requested-With': 'XMLHttpRequest',
              },
              body: JSON.stringify({
                initiator: 'desktop',
              }),
              signal: attemptAbortController.signal,
            },
          );
          if (!isCurrentAttempt()) {
            void response.body?.cancel();
            return;
          }
          if (!response.ok) {
            throw new Error(`Failed to create pairing (${response.status})`);
          }
          const payload = parsePairingResponse(await response.json());
          if (!isCurrentAttempt()) return;
          if (!payload) {
            throw new Error('The pairing service returned an invalid response.');
          }

          const nextSignalingClient = new SignalingClient({
            wsUrl: payload.signaling.wsUrl,
            code: payload.code,
            role: 'desktop',
            pairToken: payload.pairTokens.desktop,
            metadata: {
              platform: 'desktop',
            },
            onEvent: (event) => {
              void handleSignalingEvent(
                event,
                attemptGeneration as number,
                requestContext.boundary,
              ).catch((error) => {
                if (isCurrentAttempt()) {
                  console.warn('[mobile-companion] signaling event handling failed:', error);
                }
              });
            },
          } satisfies SignalingClientOptions);
          if (!isCurrentAttempt()) {
            nextSignalingClient.close();
            return;
          }
          signalingClient = nextSignalingClient;

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
          if (
            attemptGeneration !== null &&
            attemptBoundary !== null &&
            !isCurrentManagedGeneration(attemptGeneration, attemptBoundary)
          ) {
            return;
          }
          console.error('[mobile-companion] failed to request pairing code', error);
          const message = error instanceof Error ? error.message : 'pairing_request_failed';
          resetConnection();
          set({
            status: 'error',
            error: message,
          });
        } finally {
          if (pairingAbortController === attemptAbortController) {
            pairingAbortController = null;
          }
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

function activeCompanionBoundaryIsInvalid(): boolean {
  const boundary = activeManagedBoundary;
  if (!boundary) return false;
  const auth = useAuthStore.getState();
  return (
    selectPrivacyMode(useAppModeStore.getState()) !== 'managed' ||
    !selectHasCloudAccountSession(auth) ||
    auth.user?.id !== boundary.accountId ||
    auth.cloudSessionEpoch !== boundary.sessionEpoch
  );
}

function stopCompanionAtInvalidBoundary(): void {
  if (activeCompanionBoundaryIsInvalid()) {
    useConnectionStore.getState().stopSession();
  }
}

// These subscriptions are deliberately module-owned rather than UI-owned.
// Closing a panel cannot extend a companion's authority, and every Zustand
// transition reaches these listeners synchronously before later async work can
// install an A-owned socket/peer under account B.
useAppModeStore.subscribe(stopCompanionAtInvalidBoundary);
useAuthStore.subscribe(stopCompanionAtInvalidBoundary);
