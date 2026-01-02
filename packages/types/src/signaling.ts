export type SignalingRole = 'desktop' | 'mobile';

export type SignalingEvent =
  | { type: 'open' }
  | { type: 'registered'; expiresAt: number; peerConnected: boolean }
  | { type: 'peer_ready'; role: SignalingRole; metadata?: Record<string, unknown> | null }
  | {
      type: 'signal';
      from: SignalingRole;
      kind: 'offer' | 'answer' | 'ice' | 'control';
      payload: unknown;
    }
  | { type: 'peer_left'; role: SignalingRole }
  | { type: 'session_expired' }
  | { type: 'terminated' }
  | { type: 'error'; error: string }
  | { type: 'close' };

export type SignalKind = 'offer' | 'answer' | 'ice' | 'control';

export interface SignalingClientOptions {
  wsUrl: string;
  code: string;
  role: SignalingRole;
  metadata?: Record<string, unknown>;
  onEvent: (event: SignalingEvent) => void;
  heartbeatIntervalMs?: number;
}
