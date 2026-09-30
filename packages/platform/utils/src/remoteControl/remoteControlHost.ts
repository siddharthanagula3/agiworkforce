import { SignalingClient, endsPairing, type SignalingEvent } from '../signaling';
import {
  REMOTE_CODE_LIMITS,
  clipRemoteResult,
  clipRemoteText,
  isRelayPairingCode,
  isSecureRelayUrl,
  type DispatchTaskLifecycleStatus,
  type DispatchTaskPendingStep,
  type DispatchTaskReplyError,
} from '@agiworkforce/types';
import {
  IDLE_REMOTE_CONTROL_STATE,
  type DesktopRuntimeEvent,
  type DeveloperSessionEvent,
  type DispatchTaskReport,
  type RemoteControlStartRequest,
  type RemoteControlState,
} from '@agiworkforce/local-runtime-contract';
import { createControlReceiptLedger } from './controlReceipts';
import {
  createCodeRemoteController,
  parseDispatchTask,
  type CodeRemoteDependencies,
} from './codeRemoteController';
import {
  createDispatchSession,
  deriveDispatchKey,
  generatePairingSecret,
  signDispatchEnvelope,
  verifyDispatchEnvelope,
  type DispatchSession,
} from './dispatchEnvelope';

const MAX_TOKEN_LENGTH = 16_384;
const MAX_ID_LENGTH = 128;
const MAX_REMEMBERED_TASKS = 10_000;
const HEARTBEAT_INTERVAL_MS = 25_000;
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;

const PAGE_CLOSED_BEFORE_FINISHING =
  'The AGI Workforce window running this task closed before it finished.';
const FINISHED_TASK_STATUSES: ReadonlySet<DispatchTaskLifecycleStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
  'rejected',
]);

export type RemoteSocketFactory = (wsUrl: string) => WebSocket;

export type DispatchPageEvent = Extract<
  DesktopRuntimeEvent,
  { kind: 'dispatch-task' | 'dispatch-task-cancel' | 'dispatch-task-reply' }
>;

export interface DispatchTaskPages {
  current: () => number | null;
  deliver: (page: number, event: DispatchPageEvent) => boolean;
}

export interface RemoteControlHostOptions {
  allowInsecureLoopback?: boolean;
  code: Omit<CodeRemoteDependencies, 'send'>;
  deviceName: () => string;
  appVersion: () => string;
  createSocket: RemoteSocketFactory;
  onStateChanged: (state: RemoteControlState) => void;
  dispatchPages?: DispatchTaskPages;
  createClient?: (
    options: ConstructorParameters<typeof SignalingClient>[0],
  ) => Pick<SignalingClient, 'sendSignal' | 'close'>;
}

interface PageTask {
  page: number;
  conversationId: string | null;
  finished: boolean;
  undelivered: Record<string, unknown> | null;
}

export class RemoteControlRefused extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStartRequest(
  args: Record<string, unknown>,
  allowInsecureLoopback: boolean,
): RemoteControlStartRequest {
  const { code, wsUrl, pairToken, expiresAt } = args;
  if (typeof code !== 'string' || !isRelayPairingCode(code)) {
    throw new RemoteControlRefused('The pairing code is not valid.');
  }
  if (typeof wsUrl !== 'string') throw new RemoteControlRefused('The relay address is missing.');
  if (!isSecureRelayUrl(wsUrl, allowInsecureLoopback)) {
    throw new RemoteControlRefused('The relay address must use a secure WebSocket connection.');
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

/**
 * The phone names itself, so its name is text from the other end of the pairing.
 * Control characters and bidirectional overrides could make it display as a
 * different name, so they are removed before it is shown.
 */
function displayableName(raw: string): string | null {
  const cleaned = raw
    .replace(/[\p{Cc}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, '')
    .trim()
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : null;
}

export function createRemoteControlHost(options: RemoteControlHostOptions) {
  let state: RemoteControlState = { ...IDLE_REMOTE_CONTROL_STATE };
  let client: Pick<SignalingClient, 'sendSignal' | 'close'> | null = null;
  let pairingSecret: string | null = null;
  let dispatch: DispatchSession | null = null;
  let generation = 0;
  let active: RemoteControlStartRequest | null = null;
  let registered = false;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const receipts = createControlReceiptLedger();
  const pageTasks = new Map<string, PageTask>();
  const createdTasks = new Set<string>();
  let queue: Promise<void> = Promise.resolve();

  function rememberCreatedTask(requestId: string): void {
    createdTasks.add(requestId);
    if (createdTasks.size <= MAX_REMEMBERED_TASKS) return;
    const oldest = createdTasks.values().next().value;
    if (oldest !== undefined) createdTasks.delete(oldest);
  }

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

  function clipped(text: string | undefined): string | undefined {
    if (text === undefined) return undefined;
    const value = clipRemoteText(text, REMOTE_CODE_LIMITS.partialResponseLength).text;
    return value === '' ? undefined : value;
  }

  async function sendPageTaskStatus(
    requestId: string,
    task: PageTask,
    status: DispatchTaskLifecycleStatus,
    detail: {
      message?: string;
      result?: string;
      error?: string;
      pending?: DispatchTaskPendingStep[];
      replyError?: DispatchTaskReplyError;
    } = {},
  ): Promise<void> {
    const message = clipped(detail.message);
    const result =
      detail.result === undefined || detail.result === ''
        ? undefined
        : clipRemoteResult(detail.result, REMOTE_CODE_LIMITS.partialResponseLength);
    const error = clipped(detail.error);
    const payload: Record<string, unknown> = {
      version: 1,
      requestId,
      status,
      ...(task.conversationId === null ? {} : { taskId: task.conversationId }),
      ...(message === undefined ? {} : { message }),
      ...(result === undefined ? {} : { result }),
      ...(error === undefined ? {} : { error }),
      ...(status === 'awaiting_input' && detail.pending?.length ? { pending: detail.pending } : {}),
      ...(detail.replyError ? { replyError: detail.replyError } : {}),
      updatedAt: new Date().toISOString(),
    };
    const delivered = await send('dispatch.task.status', payload);
    task.undelivered = delivered ? null : payload;
    if (delivered && task.finished) pageTasks.delete(requestId);
  }

  async function flushPageTasks(): Promise<void> {
    for (const [requestId, task] of [...pageTasks]) {
      if (task.undelivered === null) continue;
      if (!(await send('dispatch.task.status', task.undelivered))) return;
      task.undelivered = null;
      if (task.finished) pageTasks.delete(requestId);
    }
  }

  async function routeDispatchToPage(
    action: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    const pages = options.dispatchPages;
    if (!pages) return false;
    const request = parseDispatchTask(action, payload);
    if (!request) return false;
    if (request.action === 'dispatch.task.cancel') {
      const task = pageTasks.get(request.requestId);
      if (!task) return false;
      if (task.finished) return true;
      if (
        request.taskId !== undefined &&
        task.conversationId !== null &&
        request.taskId !== task.conversationId
      ) {
        return false;
      }
      if (
        !pages.deliver(task.page, { kind: 'dispatch-task-cancel', requestId: request.requestId })
      ) {
        task.finished = true;
        await sendPageTaskStatus(request.requestId, task, 'failed', {
          error: PAGE_CLOSED_BEFORE_FINISHING,
        });
      }
      return true;
    }
    if (request.action === 'dispatch.task.reply') {
      const task = pageTasks.get(request.taskRequestId);
      if (!task) return false;
      if (task.finished) return true;
      pages.deliver(task.page, {
        kind: 'dispatch-task-reply',
        requestId: request.taskRequestId,
        replies: request.replies,
      });
      return true;
    }
    const page = pages.current();
    if (page === null) return false;
    const delivered = pages.deliver(page, {
      kind: 'dispatch-task',
      task: {
        requestId: request.requestId,
        prompt: request.prompt,
        ...(request.title === undefined ? {} : { title: request.title }),
        sentAt: request.sentAt,
        phoneName: state.phoneName,
      },
    });
    if (!delivered) return false;
    pageTasks.set(request.requestId, {
      page,
      conversationId: null,
      finished: false,
      undelivered: null,
    });
    return true;
  }

  function reportDispatchTask(page: number, report: DispatchTaskReport): boolean {
    const task = pageTasks.get(report.requestId);
    if (!task || task.page !== page || task.finished) return false;
    if (report.conversationId !== undefined) task.conversationId = report.conversationId;
    if (FINISHED_TASK_STATUSES.has(report.status)) task.finished = true;
    enqueue(() =>
      sendPageTaskStatus(report.requestId, task, report.status, {
        ...(report.message === undefined ? {} : { message: report.message }),
        ...(report.result === undefined ? {} : { result: report.result }),
        ...(report.error === undefined ? {} : { error: report.error }),
        ...(report.pending === undefined ? {} : { pending: report.pending }),
        ...(report.replyError === undefined ? {} : { replyError: report.replyError }),
      }),
    );
    return true;
  }

  function dispatchPageGone(page: number): void {
    for (const [requestId, task] of pageTasks) {
      if (task.page !== page || task.finished) continue;
      task.finished = true;
      enqueue(() =>
        sendPageTaskStatus(requestId, task, 'failed', { error: PAGE_CLOSED_BEFORE_FINISHING }),
      );
    }
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
      const repeatedTask = action === 'dispatch.task.create' && createdTasks.has(requestId);
      const receipt = receipts.record(action, requestId);
      await send(receipt.action, {
        ...receipt,
        ...(repeatedTask ? { outcome: 'duplicate' as const } : {}),
      });
      if (receipt.outcome === 'duplicate' || repeatedTask) return;
      if (action === 'dispatch.task.create') rememberCreatedTask(requestId);
    }

    if (await routeDispatchToPage(action, inner)) return;

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
      phoneName: typeof phoneName === 'string' ? displayableName(phoneName) : null,
    });
    enqueue(flushPageTasks);
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
      case 'registered':
        if (active) active = { ...active, pairToken: event.pairToken };
        registered = true;
        reconnectAttempts = 0;
        if (state.status === 'reconnecting') publish({ status: 'waiting', error: null });
        return;
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
        if (event.error === 'device_revoked') {
          end(
            'Remote Control was turned off for this computer in your account settings. Pair again to reconnect your phone.',
          );
          return;
        }
        if (endsPairing(event.error)) {
          end('This pairing has ended. Pair again to reconnect your phone.');
          return;
        }
        if (registered) return;
        if (state.status !== 'connected')
          publish({ status: 'error', error: 'The relay connection failed.' });
        return;
      case 'close':
        if (registered) {
          reconnect();
          return;
        }
        end('The connection to the relay closed. Pair again to reconnect your phone.');
        return;
      default:
        return;
    }
  }

  function end(error: string): void {
    stop();
    publish({ status: 'error', error });
  }

  function reconnect(): void {
    generation += 1;
    client = null;
    dispatch = null;
    publish({ status: 'reconnecting', phoneName: null, attachedSessions: 0, error: null });
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempts,
      RECONNECT_MAX_DELAY_MS,
    );
    reconnectAttempts += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (active) connect(active);
    }, delay);
  }

  function start(args: Record<string, unknown>): RemoteControlState {
    const request = parseStartRequest(args, options.allowInsecureLoopback === true);
    stop();
    pairingSecret = generatePairingSecret();
    active = request;
    publish({
      status: 'waiting',
      pairingCode: request.code,
      qrPayload: `agiw3:${request.code}:${pairingSecret}`,
      expiresAt: request.expiresAt,
      phoneName: null,
      attachedSessions: 0,
      error: null,
    });
    connect(request);
    return state;
  }

  function connect(request: RemoteControlStartRequest): void {
    const eventGeneration = ++generation;
    const clientOptions = {
      allowInsecureLoopback: options.allowInsecureLoopback,
      wsUrl: request.wsUrl,
      code: request.code,
      pairToken: request.pairToken,
      role: 'desktop' as const,
      metadata: {
        deviceType: 'desktop',
        deviceName: options.deviceName(),
        app: 'agiworkforce-desktop',
        version: options.appVersion(),
        capabilities: ['code-sessions', 'code-session-start'],
      },
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      createSocket: options.createSocket,
      onEvent: (event: SignalingEvent) => onEvent(event, eventGeneration),
    };
    client = options.createClient
      ? options.createClient(clientOptions)
      : new SignalingClient(clientOptions);
  }

  function stop(): RemoteControlState {
    generation += 1;
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    active = null;
    registered = false;
    reconnectAttempts = 0;
    client?.close({ endPairing: true });
    client = null;
    dispatch = null;
    pairingSecret = null;
    receipts.clear();
    pageTasks.clear();
    createdTasks.clear();
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
    reportDispatchTask,
    dispatchPageGone,
  };
}

export type RemoteControlHost = ReturnType<typeof createRemoteControlHost>;
