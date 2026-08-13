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
 * Safely convert a value to a string, with a fallback
 */
function safeToString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
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

function isValidPeerLeftReason(
  value: unknown,
): value is 'disconnect' | 'error' | 'timeout' | 'terminated' {
  return (
    value === 'disconnect' || value === 'error' || value === 'timeout' || value === 'terminated'
  );
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

function safeToPeerLeftReason(
  value: unknown,
): 'disconnect' | 'error' | 'timeout' | 'terminated' | undefined {
  return isValidPeerLeftReason(value) ? value : undefined;
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

  /**
   * Hand a signal to the currently-open websocket.
   *
   * `true` means the browser/native websocket accepted the frame locally; it
   * is not a peer acknowledgement. Callers that surface delivery state must
   * still wait for their domain-level response (for example a Dispatch status
   * event).
   */
  sendSignal(kind: SignalKind, payload: unknown): boolean {
    return this.send({
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
        pairToken: this.options.pairToken,
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

  private send(payload: Record<string, unknown>): boolean {
    if (!this.socket) {
      return false;
    }
    if (this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      this.socket.send(JSON.stringify(payload));
      return true;
    } catch (error) {
      console.warn('[signaling] failed to send payload', error);
      return false;
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
        const reason = safeToPeerLeftReason(message['reason']);
        this.options.onEvent({
          type: 'peer_left',
          role: safeToSignalingRole(message['role'], 'mobile'),
          ...(reason ? { reason } : {}),
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
      case 'heartbeat_ack': {
        this.options.onEvent({
          type: 'heartbeat_ack',
          timestamp: safeToNumber(message['timestamp'], Date.now()),
        });
        break;
      }
      case 'sync_request': {
        this.options.onEvent({
          type: 'sync_request',
          reason: safeToString(message['reason'], 'unspecified'),
          timestamp: safeToNumber(message['timestamp'], Date.now()),
        });
        break;
      }
      case 'approval_queued': {
        this.options.onEvent({
          type: 'approval_queued',
          code: safeToString(message['code'], ''),
        });
        break;
      }
      case 'connection_timeout': {
        this.options.onEvent({
          type: 'connection_timeout',
          reason: safeToString(message['reason'], 'idle'),
        });
        break;
      }
      case 'server_shutdown': {
        this.options.onEvent({
          type: 'server_shutdown',
          reason: safeToString(message['reason'], 'server_shutdown'),
        });
        break;
      }
      default:
        console.warn('[signaling] unknown message type received', message);
        break;
    }
  }
}
