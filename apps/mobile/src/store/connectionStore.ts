import { create } from 'zustand';
import {
  createMobilePeerConnection,
  acceptOffer,
  addRemoteCandidate,
  type MediaStream,
  type RTCPeerConnection,
  type RTCDataChannelLike,
  type SessionDescriptionInit,
  type CandidateInit,
} from '../services/webrtc';
import {
  createMobileSignalingClient,
  parsePairingPayload,
  type SignalingEvent,
  type PairingDetails,
} from '../services/signaling';

type ConnectionStatus = 'idle' | 'connecting' | 'paired' | 'connected' | 'error';

interface MobileConnectionState {
  status: ConnectionStatus;
  pairing: PairingDetails | null;
  remoteStream: MediaStream | null;
  dataChannelReady: boolean;
  error: string | null;
  connect: (details: PairingDetails) => void;
  connectFromPayload: (payload: string) => void;
  disconnect: () => void;
  sendControl: (payload: Record<string, unknown>) => void;
  clearError: () => void;
}

let signalingClient: ReturnType<typeof createMobileSignalingClient> | null = null;
let peerConnection: RTCPeerConnection | null = null;
let controlChannel: RTCDataChannelLike | null = null;

export const useConnectionStore = create<MobileConnectionState>((set) => {
  const reset = () => {
    if (signalingClient) {
      signalingClient.close();
      signalingClient = null;
    }
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    if (controlChannel) {
      try {
        controlChannel.close();
      } catch {
        // ignore channel close errors
      }
      controlChannel = null;
    }
    set({ dataChannelReady: false, remoteStream: null });
  };

  const handleEvent = async (event: SignalingEvent) => {
    switch (event.type) {
      case 'registered':
        set({ status: 'paired', error: null });
        break;
      case 'peer_ready':
        // Desktop indicates readiness; wait for offer.
        break;
      case 'signal':
        if (event.kind === 'offer') {
          await ensurePeerConnection();
          if (!peerConnection) {
            set({ status: 'error', error: 'peer_unavailable', dataChannelReady: false });
            return;
          }
          try {
            const answer = await acceptOffer(
              peerConnection,
              event.payload as SessionDescriptionInit,
            );
            signalingClient?.sendSignal('answer', answer);
            set({ status: 'connected', error: null });
          } catch (error) {
            console.error('[mobile] failed to accept offer', error);
            set({
              status: 'error',
              error: error instanceof Error ? error.message : 'offer_rejected',
              dataChannelReady: false,
            });
          }
        } else if (event.kind === 'ice') {
          if (!peerConnection) {
            return;
          }
          try {
            await addRemoteCandidate(peerConnection, event.payload as CandidateInit);
          } catch (error) {
            console.warn('[mobile] failed to add ICE candidate', error);
          }
        }
        break;
      case 'peer_left':
        set({ status: 'paired', dataChannelReady: false, remoteStream: null });
        break;
      case 'session_expired':
      case 'terminated':
        reset();
        set({
          status: 'idle',
          pairing: null,
          remoteStream: null,
          dataChannelReady: false,
          error: null,
        });
        break;
      case 'error':
        set({ status: 'error', error: event.error, dataChannelReady: false });
        break;
      case 'close':
        reset();
        set({
          status: 'idle',
          pairing: null,
          remoteStream: null,
          dataChannelReady: false,
          error: null,
        });
        break;
      default:
        break;
    }
  };

  const ensurePeerConnection = async () => {
    if (peerConnection) {
      return peerConnection;
    }

    peerConnection = createMobilePeerConnection({
      onRemoteStream(stream) {
        set({ remoteStream: stream, error: null });
      },
      onDataChannel(event) {
        controlChannel = event.channel;
        controlChannel.onopen = () => {
          set({ dataChannelReady: true });
        };
        controlChannel.onclose = () => {
          set({ dataChannelReady: false });
        };
      },
      onIceCandidate(candidate) {
        signalingClient?.sendSignal('ice', candidate);
      },
      onConnectionStateChange(state) {
        if (state === 'disconnected' || state === 'failed') {
          set({ status: 'error', error: 'connection_lost', dataChannelReady: false });
        }
      },
    });

    return peerConnection;
  };

  const connect = (details: PairingDetails) => {
    reset();
    set({
      status: 'connecting',
      pairing: details,
      dataChannelReady: false,
      error: null,
      remoteStream: null,
    });
    signalingClient = createMobileSignalingClient({
      code: details.code,
      wsUrl: details.wsUrl,
      onEvent: (event) => {
        void handleEvent(event);
      },
      metadata: {
        platform: 'mobile',
        connectedAt: Date.now(),
      },
    });
  };

  const connectFromPayload = (payload: string) => {
    const parsed = parsePairingPayload(payload);
    if (!parsed) {
      set({ status: 'error', error: 'invalid_pairing_payload', dataChannelReady: false });
      return;
    }
    connect(parsed);
  };

  const disconnect = () => {
    reset();
    set({
      status: 'idle',
      pairing: null,
      remoteStream: null,
      dataChannelReady: false,
      error: null,
    });
  };

  const sendControl = (payload: Record<string, unknown>) => {
    if (!controlChannel || controlChannel.readyState !== 'open') {
      throw new Error('control_channel_not_ready');
    }
    controlChannel.send(JSON.stringify(payload));
  };

  return {
    status: 'idle',
    pairing: null,
    remoteStream: null,
    dataChannelReady: false,
    error: null,
    connect,
    connectFromPayload,
    disconnect,
    sendControl,
    clearError() {
      set({ error: null });
    },
  };
});
