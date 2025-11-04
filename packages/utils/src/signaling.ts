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

export interface SignalingClientOptions {
  wsUrl: string;
  code: string;
  role: SignalingRole;
  metadata?: Record<string, unknown>;
  onEvent: (event: SignalingEvent) => void;
  heartbeatIntervalMs?: number;
}

export class SignalingClient {
  private socket: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private closed = false;

  constructor(private readonly options: SignalingClientOptions) {
    this.connect();
  }

  sendSignal(kind: 'offer' | 'answer' | 'ice' | 'control', payload: unknown) {
    this.send({
      type: 'signal',
      kind,
      payload,
    });
  }

  close() {
    this.closed = true;
    if (this.heartbeatTimer !== undefined) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.close();
      } catch {
        // ignore
      }
    }
    this.socket = null;
  }

  private connect() {
    const socket = new WebSocket(this.options.wsUrl);
    this.socket = socket;

    socket.onopen = () => {
      this.options.onEvent({ type: 'open' });
      this.send({
        type: 'register',
        code: this.options.code,
        role: this.options.role,
        metadata: this.options.metadata,
      });
      const heartbeatEvery = this.options.heartbeatIntervalMs ?? 25000;
      this.heartbeatTimer = setInterval(() => {
        this.send({ type: 'heartbeat' });
      }, heartbeatEvery);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data));
        this.handleIncoming(data);
      } catch (error) {
        console.warn('[signaling] failed to parse incoming message', error);
      }
    };

    socket.onerror = () => {
      this.options.onEvent({ type: 'error', error: 'connection_error' });
    };

    socket.onclose = () => {
      if (this.heartbeatTimer !== undefined) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = undefined;
      }
      this.options.onEvent({ type: 'close' });
      if (!this.closed) {
        this.options.onEvent({ type: 'error', error: 'connection_closed' });
      }
    };
  }

  private send(payload: Record<string, unknown>) {
    if (!this.socket) {
      return;
    }
    if (this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      this.socket.send(JSON.stringify(payload));
    } catch (error) {
      console.warn('[signaling] failed to send payload', error);
    }
  }

  private handleIncoming(message: Record<string, unknown>) {
    const type = message['type'];
    switch (type) {
      case 'registered': {
        this.options.onEvent({
          type: 'registered',
          expiresAt: Number(message['expiresAt'] ?? 0),
          peerConnected: Boolean(message['peerConnected']),
        });
        break;
      }
      case 'peer_ready': {
        this.options.onEvent({
          type: 'peer_ready',
          role: (message['role'] as SignalingRole) ?? 'mobile',
          metadata: (message['metadata'] as Record<string, unknown> | null | undefined) ?? null,
        });
        break;
      }
      case 'signal': {
        this.options.onEvent({
          type: 'signal',
          from: (message['from'] as SignalingRole) ?? 'mobile',
          kind: (message['kind'] as 'offer' | 'answer' | 'ice' | 'control') ?? 'offer',
          payload: message['payload'],
        });
        break;
      }
      case 'peer_left': {
        this.options.onEvent({
          type: 'peer_left',
          role: (message['role'] as SignalingRole) ?? 'mobile',
        });
        break;
      }
      case 'session_expired': {
        this.options.onEvent({ type: 'session_expired' });
        this.close();
        break;
      }
      case 'terminated': {
        this.options.onEvent({ type: 'terminated' });
        this.close();
        break;
      }
      case 'error': {
        this.options.onEvent({
          type: 'error',
          error: typeof message['error'] === 'string' ? message['error'] : 'unknown_error',
        });
        break;
      }
      case 'heartbeat_ack':
        // ignore ack
        break;
      default:
        console.warn('[signaling] unknown message type received', message);
        break;
    }
  }
}
