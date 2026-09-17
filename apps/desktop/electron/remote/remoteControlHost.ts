import { SignalingClient, type SignalingEvent } from '@agiworkforce/utils';
import {
  IDLE_REMOTE_CONTROL_STATE,
  type DeveloperSessionEvent,
  type RemoteControlStartRequest,
  type RemoteControlState,
} from '@agiworkforce/local-runtime-contract';
import { createControlReceiptLedger } from '../../src/services/controlReceipts';
import { createCodeRemoteController, type CodeRemoteDependencies } from './codeRemoteController';
import {
  createDispatchSession,
  deriveDispatchKey,
  generatePairingSecret,
  signDispatchEnvelope,
  verifyDispatchEnvelope,
  type DispatchSession,
} from './dispatchEnvelope';

const PAIRING_CODE_PATTERN = /^[A-Z0-9]{8,32}$/;
const MAX_TOKEN_LENGTH = 16_384;
const MAX_ID_LENGTH = 128;
const HEARTBEAT_INTERVAL_MS = 25_000;

export type RemoteSocketFactory = (wsUrl: string) => WebSocket;

export interface RemoteControlHostOptions {
  code: Omit<CodeRemoteDependencies, 'send'>;
  deviceName: () => string;
  appVersion: () => string;
  createSocket: RemoteSocketFactory;
  onStateChanged: (state: RemoteControlState) => void;
  createClient?: (
    options: ConstructorParameters<typeof SignalingClient>[0],
  ) => Pick<SignalingClient, 'sendSignal' | 'close'>;
}

export class RemoteControlRefused extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStartRequest(args: Record<string, unknown>): RemoteControlStartRequest {
  const { code, wsUrl, pairToken, expiresAt } = args;
  if (typeof code !== 'string' || !PAIRING_CODE_PATTERN.test(code)) {
    throw new RemoteControlRefused('The pairing code is not valid.');
  }
  if (typeof wsUrl !== 'string') throw new RemoteControlRefused('The relay address is missing.');
  let protocol: string;
  try {
    protocol = new URL(wsUrl).protocol;
  } catch {
    throw new RemoteControlRefused('The relay address is not valid.');
  }
  if (protocol !== 'wss:' && protocol !== 'ws:') {
    throw new RemoteControlRefused('The relay address is not a WebSocket address.');
  }
  if (
    typeof pairToken !== 'string' ||
    pairToken.length === 0 ||
    pairToken.length > MAX_TOKEN_LENGTH
  ) {
    throw new RemoteControlRefused('The pairing token is not valid.');
  }
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
    throw new RemoteControlRefused('The pairing expiry is not valid.');
  }
  return { code, wsUrl, pairToken, expiresAt };
}

function signedEnvelopeFrom(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;
  const data = payload['data'];
  if (isRecord(data) && typeof data['hmac'] === 'string') return data;
  return payload;
}

export function createRemoteControlHost(options: RemoteControlHostOptions) {
  let state: RemoteControlState = { ...IDLE_REMOTE_CONTROL_STATE };
  let client: Pick<SignalingClient, 'sendSignal' | 'close'> | null = null;
  let pairingSecret: string | null = null;
  let dispatch: DispatchSession | null = null;
  let generation = 0;
  const receipts = createControlReceiptLedger();
  let queue: Promise<void> = Promise.resolve();

  function enqueue(work: () => Promise<void>): void {
    queue = queue.then(work).catch((error: unknown) => {
      console.warn('[remote-control] relay failed:', error);
    });
  }

  function publish(patch: Partial<RemoteControlState>): void {
    state = { ...state, ...patch };
    options.onStateChanged(state);
  }

  async function send(action: string, payload: Record<string, unknown>): Promise<boolean> {
    if (!client || !dispatch) return false;
    const envelope = signDispatchEnvelope(dispatch, action, { ...payload, action });
    return client.sendSignal('control', { action, data: envelope });
  }

  const controller = createCodeRemoteController({ ...options.code, send });

  function refreshAttached(): void {
    const attachedSessions = controller.attachedThreadCount();
    if (attachedSessions !== state.attachedSessions) publish({ attachedSessions });
  }

  async function handleControl(payload: unknown): Promise<void> {
    if (!dispatch) return;
    const verified = verifyDispatchEnvelope(dispatch, signedEnvelopeFrom(payload));
    if (!verified.ok) {
      if (verified.reason === 'update_required') {
        publish({
          status: 'error',
          error: 'The phone runs an older AGI Workforce build. Update the app, then pair again.',
        });
      }
      return;
    }
    const inner = verified.envelope.payload;
    if (!isRecord(inner)) return;
    const action = typeof inner['action'] === 'string' ? inner['action'] : verified.envelope.type;

    if (action === 'heartbeat') {
      await send('heartbeat_ack', {
        timestamp: typeof inner['timestamp'] === 'number' ? inner['timestamp'] : Date.now(),
        receivedAt: Date.now(),
      });
      return;
    }

    const requestId = inner['requestId'];
    if (
      typeof requestId === 'string' &&
      requestId.length > 0 &&
      requestId.length <= MAX_ID_LENGTH
    ) {
      const receipt = receipts.record(action, requestId);
      await send(receipt.action, { ...receipt });
      if (receipt.outcome === 'duplicate') return;
    }

    if (action === 'sync_request') {
      await controller.handleControl('code.sessions.list', {
        version: 1,
        requestId: typeof requestId === 'string' ? requestId : `sync-${Date.now()}`,
        sentAt: new Date().toISOString(),
      });
      return;
    }
    await controller.handleControl(action, inner);
    refreshAttached();
  }

  function onPeerReady(metadata: Record<string, unknown> | null): void {
    const salt = metadata?.['dispatchSalt'];
    if (!pairingSecret || !state.pairingCode || typeof salt !== 'string' || salt.length === 0) {
      publish({
        status: 'error',
        error: 'The phone did not offer a secure session. Update the app, then pair again.',
      });
      return;
    }
    try {
      dispatch = createDispatchSession(deriveDispatchKey(state.pairingCode, salt, pairingSecret));
    } catch {
      publish({ status: 'error', error: 'Secure pairing could not start. Pair again.' });
      return;
    }
    const phoneName = metadata?.['deviceName'];
    publish({
      status: 'connected',
      error: null,
      phoneName: typeof phoneName === 'string' ? phoneName.slice(0, 120) : null,
    });
    void controller
      .handleControl('code.sessions.list', {
        version: 1,
        requestId: `peer-ready-${Date.now()}`,
        sentAt: new Date().toISOString(),
      })
      .catch(() => undefined);
  }

  function onEvent(event: SignalingEvent, eventGeneration: number): void {
    if (eventGeneration !== generation) return;
    switch (event.type) {
      case 'peer_ready':
        onPeerReady(event.metadata ?? null);
        return;
      case 'signal':
        if (event.kind === 'control') enqueue(() => handleControl(event.payload));
        return;
      case 'peer_left':
        dispatch = null;
        controller.reset();
        publish({ status: 'waiting', phoneName: null, attachedSessions: 0 });
        return;
      case 'session_expired':
      case 'terminated':
        stop();
        return;
      case 'error':
        if (state.status !== 'connected')
          publish({ status: 'error', error: 'The relay connection failed.' });
        return;
      default:
        return;
    }
  }

  function start(args: Record<string, unknown>): RemoteControlState {
    const request = parseStartRequest(args);
    stop();
    const eventGeneration = ++generation;
    pairingSecret = generatePairingSecret();
    publish({
      status: 'waiting',
      pairingCode: request.code,
      qrPayload: `agiw3:${request.code}:${pairingSecret}`,
      expiresAt: request.expiresAt,
      phoneName: null,
      attachedSessions: 0,
      error: null,
    });
    const clientOptions = {
      wsUrl: request.wsUrl,
      code: request.code,
      pairToken: request.pairToken,
      role: 'desktop' as const,
      metadata: {
        deviceType: 'desktop',
        deviceName: options.deviceName(),
        app: 'agiworkforce-desktop',
        version: options.appVersion(),
        capabilities: ['code-sessions'],
      },
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      createSocket: options.createSocket,
      onEvent: (event: SignalingEvent) => onEvent(event, eventGeneration),
    };
    client = options.createClient
      ? options.createClient(clientOptions)
      : new SignalingClient(clientOptions);
    return state;
  }

  function stop(): RemoteControlState {
    generation += 1;
    client?.close();
    client = null;
    dispatch = null;
    pairingSecret = null;
    receipts.clear();
    controller.reset();
    if (state.status !== 'idle') publish({ ...IDLE_REMOTE_CONTROL_STATE });
    return state;
  }

  function handleSessionEvent(rootId: string, event: DeveloperSessionEvent): void {
    if (!dispatch) return;
    enqueue(() => controller.handleSessionEvent(rootId, event));
  }

  return {
    start,
    stop,
    state: () => state,
    handleSessionEvent,
  };
}

export type RemoteControlHost = ReturnType<typeof createRemoteControlHost>;
