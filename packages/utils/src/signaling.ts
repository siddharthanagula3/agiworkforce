import type {
  SignalingRole,
  SignalingEvent,
  SignalingClientOptions,
  SignalKind,
} from '@agiworkforce/types';

// Re-export types for backwards compatibility
export type { SignalingRole, SignalingEvent, SignalingClientOptions, SignalKind };

// Helper functions for safe type coercion and validation

/**
 * Safely parse JSON string, returning null on failure
 */
function safeJsonParse(data: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(data);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Safely convert a value to a number, with a fallback
 */
function safeToNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

/**
 * Validate if a value is a valid SignalingRole
 */
function isValidSignalingRole(value: unknown): value is SignalingRole {
  return value === 'desktop' || value === 'mobile';
}

/**
 * Validate if a value is a valid SignalKind
 */
function isValidSignalKind(value: unknown): value is SignalKind {
  return value === 'offer' || value === 'answer' || value === 'ice' || value === 'control';
}

/**
 * Safely extract a SignalingRole from a message, with fallback
 */
function safeToSignalingRole(value: unknown, fallback: SignalingRole): SignalingRole {
  return isValidSignalingRole(value) ? value : fallback;
}

/**
 * Safely extract a SignalKind from a message, with fallback
 */
function safeToSignalKind(value: unknown, fallback: SignalKind): SignalKind {
  return isValidSignalKind(value) ? value : fallback;
}

/**
 * Safely extract metadata from a message
 */
function safeToMetadata(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export class SignalingClient {
  private socket: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private closed = false;

  constructor(private readonly options: SignalingClientOptions) {
    this.connect();
  }

  sendSignal(kind: SignalKind, payload: unknown) {
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
      const data = safeJsonParse(String(event.data));
      if (data === null) {
        console.warn('[signaling] failed to parse incoming message as valid JSON object');
        return;
      }
      this.handleIncoming(data);
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
          expiresAt: safeToNumber(message['expiresAt'], 0),
          peerConnected: Boolean(message['peerConnected']),
        });
        break;
      }
      case 'peer_ready': {
        this.options.onEvent({
          type: 'peer_ready',
          role: safeToSignalingRole(message['role'], 'mobile'),
          metadata: safeToMetadata(message['metadata']),
        });
        break;
      }
      case 'signal': {
        this.options.onEvent({
          type: 'signal',
          from: safeToSignalingRole(message['from'], 'mobile'),
          kind: safeToSignalKind(message['kind'], 'offer'),
          payload: message['payload'],
        });
        break;
      }
      case 'peer_left': {
        this.options.onEvent({
          type: 'peer_left',
          role: safeToSignalingRole(message['role'], 'mobile'),
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
        break;
      default:
        console.warn('[signaling] unknown message type received', message);
        break;
    }
  }
}
