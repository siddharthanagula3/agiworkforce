import {
  MediaStream,
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
} from 'react-native-webrtc';

type DataChannelLike = {
  readyState: 'connecting' | 'open' | 'closing' | 'closed' | string;
  send(data: string): void;
  close(): void;
  onopen?: (() => void) | null;
  onclose?: (() => void) | null;
};

type RTCIceEvent = { candidate: RTCIceCandidate | null };
type RTCTrackEvent = { streams: MediaStream[] };
type DataChannelEvent = { channel: DataChannelLike };

export type { MediaStream, RTCPeerConnection, RTCIceCandidate, RTCSessionDescription };
export type RTCDataChannelLike = DataChannelLike;
export type SessionDescriptionInit = ConstructorParameters<typeof RTCSessionDescription>[0];
export type CandidateInit = ConstructorParameters<typeof RTCIceCandidate>[0];

export interface MobilePeerOptions {
  onRemoteStream: (stream: MediaStream) => void;
  onDataChannel: (event: DataChannelEvent) => void;
  onIceCandidate: (candidate: RTCIceCandidate) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
}

const ICE_SERVERS = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function createMobilePeerConnection(options: MobilePeerOptions): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  const peerWithEvents = pc as unknown as {
    onicecandidate?: (event: RTCIceEvent) => void;
    ontrack?: (event: RTCTrackEvent) => void;
    ondatachannel?: (event: { channel?: DataChannelLike | null }) => void;
    onconnectionstatechange?: () => void;
  };

  peerWithEvents.onicecandidate = (event) => {
    if (event.candidate) {
      options.onIceCandidate(event.candidate);
    }
  };

  peerWithEvents.ontrack = (event) => {
    const [stream] = event.streams;
    if (stream) {
      options.onRemoteStream(stream);
    }
  };

  peerWithEvents.ondatachannel = (event) => {
    if (event.channel) {
      options.onDataChannel({ channel: event.channel });
    }
  };

  peerWithEvents.onconnectionstatechange = () => {
    options.onConnectionStateChange(pc.connectionState);
  };

  return pc;
}

export async function acceptOffer(
  pc: RTCPeerConnection,
  offer: SessionDescriptionInit,
): Promise<SessionDescriptionInit> {
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  return answer;
}

export async function addRemoteCandidate(pc: RTCPeerConnection, candidate: CandidateInit) {
  await pc.addIceCandidate(new RTCIceCandidate(candidate));
}
