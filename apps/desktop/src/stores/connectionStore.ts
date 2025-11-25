import {
  SignalingClient,
  type SignalingClientOptions,
  type SignalingEvent,
} from '@agiworkforce/utils';
import { create } from 'zustand';

const SIGNALING_HTTP_URL =
  (import.meta.env?.['VITE_SIGNALING_HTTP_URL'] as string | undefined) ?? 'http://localhost:4000';

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
}

let signalingClient: SignalingClient | null = null;
let peerConnection: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let controlChannel: RTCDataChannel | null = null;

export const useConnectionStore = create<MobileCompanionState>((set, get) => {
  const resetConnection = () => {
    if (signalingClient) {
      signalingClient.close();
      signalingClient = null;
    }
    if (controlChannel) {
      controlChannel.close();
      controlChannel = null;
    }
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
    }
  };

  const handleControlEvent = (message: MessageEvent<string>) => {
    try {
      JSON.parse(message.data) as Record<string, unknown>;

      // TODO: integrate with automation input handlers
    } catch (error) {
      console.warn('[mobile-companion] failed to parse control payload', error);
    }
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
      case 'peer_ready':
        set({ peerConnected: true, status: 'pairing' });
        await establishPeerConnection();
        break;
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
          // Forward to data channel handler if needed
        }
        break;
      case 'peer_left':
        set({ peerConnected: false });
        break;
      case 'session_expired':
      case 'terminated':
        resetConnection();
        set({
          status: 'idle',
          pairingCode: null,
          qrData: null,
          wsUrl: null,
          expiresAt: null,
          stream: null,
          peerConnected: false,
        });
        break;
      case 'error':
        set({ status: 'error', error: event.error });
        break;
      case 'close':
        if (get().status !== 'idle') {
          set({
            status: 'idle',
            pairingCode: null,
            qrData: null,
            wsUrl: null,
            expiresAt: null,
            stream: null,
            peerConnected: false,
          });
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
      // Prefer display capture if available
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
      const response = await fetch(`${SIGNALING_HTTP_URL.replace(/\/+$/, '')}/pairings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metadata: {
            platform: 'desktop',
            requestedAt: Date.now(),
          },
        }),
      });
      if (!response.ok) {
        throw new Error(`Failed to create pairing (${response.status})`);
      }
      const payload = (await response.json()) as PairingResponse;
      signalingClient = new SignalingClient({
        wsUrl: payload.signaling.wsUrl,
        code: payload.code,
        role: 'desktop',
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
    set({
      status: 'idle',
      pairingCode: null,
      qrData: null,
      expiresAt: null,
      peerConnected: false,
      stream: null,
      wsUrl: null,
      error: null,
    });
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
});
