import { SignalingClient, endsPairing, type SignalingEvent } from '../signaling';
import {
  DISPATCH_NONCE_CACHE_TTL_MS,
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
  'The AGI Desktop window running this task closed before it finished.';
const FINISHED_TASK_STATUSES: ReadonlySet<DispatchTaskLifecycleStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
  'rejected',
]);
const MAX_PHONE_NAME_LENGTH = 60;
const MAX_SALT_LENGTH = 128;
const ASKS_FOR_SESSIONS = new Set(['code.sessions.list', 'sync_request']);

export type RemoteSocketFactory = (wsUrl: string) => WebSocket;

export type DispatchPageEvent = Extract<
  DesktopRuntimeEvent,
  { kind: 'dispatch-task' | 'dispatch-task-cancel' | 'dispatch-task-reply' }
>;

export interface DispatchTaskPages {
  current: () => number | null;
  deliver: (page: number, event: DispatchPageEvent) => boolean;
}

/** What the phone scans. It carries the pairing secret, so only main may draw it. */
export interface RemotePairingDisplay {
  code: string;
  qrPayload: string;
  expiresAt: number;
}

export interface RemotePhoneToConfirm {
  name: string | null;
  pairingCode: string;
}

export interface RemoteControlHostOptions {
  allowInsecureLoopback?: boolean;
  code: Omit<CodeRemoteDependencies, 'send'>;
  deviceName: () => string;
  appVersion: () => string;
  createSocket: RemoteSocketFactory;
  onStateChanged: (state: RemoteControlState) => void;
  dispatchPages?: DispatchTaskPages;
  /**
   * Draws the pairing code where only the person at this computer sees it.
   * A host that has nowhere safer to draw it leaves it out, and the code is
   * then published in the state its own window renders.
   */
  presentPairing?: (pairing: RemotePairingDisplay | null) => void;
  /** Asks the person at this computer to allow a phone that has not been allowed yet. */
  confirmPhone: (phone: RemotePhoneToConfirm) => Promise<boolean>;
  /** Refuses a relay this app does not pair through, beyond the secure-connection check. */
  allowRelayUrl?: (wsUrl: string) => boolean;
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
  allowRelayUrl: ((wsUrl: string) => boolean) | undefined,
): RemoteControlStartRequest {
  const { code, wsUrl, pairToken, expiresAt } = args;
  if (typeof code !== 'string' || !isRelayPairingCode(code)) {
    throw new RemoteControlRefused('The pairing code is not valid.');
  }
  if (typeof wsUrl !== 'string') throw new RemoteControlRefused('The relay address is missing.');
  if (!isSecureRelayUrl(wsUrl, allowInsecureLoopback)) {
    throw new RemoteControlRefused('The relay address must use a secure WebSocket connection.');
  }
  if (allowRelayUrl && !allowRelayUrl(wsUrl)) {
    throw new RemoteControlRefused('The relay address is not one this app pairs through.');
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

/**
 * The name is chosen by whoever is on the other end, and it is shown in a
 * native prompt asking for trust, so nothing in it may reorder or hide text.
 */
function sanitizePhoneName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, MAX_PHONE_NAME_LENGTH);
  return cleaned === '' ? null : cleaned;
}

const INSTALLATION_ID = /^[0-9a-f]{64}$/u;

/**
 * A phone that sends its installation id is known by it. One that does not is
 * known by what it says it is, which two phones of the same build share.
 */
function phoneIdentity(metadata: Record<string, unknown> | null, name: string | null): string {
  const installationId = metadata?.['installationId'];
  if (typeof installationId === 'string' && INSTALLATION_ID.test(installationId)) {
    return JSON.stringify(['installation', installationId]);
  }
  const field = (key: string) => (typeof metadata?.[key] === 'string' ? metadata[key] : '');
  return JSON.stringify([field('deviceType'), field('app'), name ?? '']);
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
  let active: RemoteControlStartRequest | null = null;
  let registered = false;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let peerAttempt = 0;
  /**
   * What the peer says it is comes over the relay unsigned, so it is a claim.
   * It becomes the phone that was allowed, and the phone that is served, only
   * when a message arrives signed with the key the scanned secret gives: the
   * relay, and anyone who only has the pairing code, cannot make one.
   */
  let claimed: { secret: string; identity: string; name: string | null } | null = null;
  let allowedPhone: { secret: string; identity: string; name: string | null } | null = null;
  let proved = false;
  /**
   * The peer the user is being asked about. Today's phone signs a request the
   * moment it attaches, which is while that question is still on screen. It
   * is not acted on, but that it verified is kept, so the phone is served as
   * soon as it is allowed and does not wait for the next thing it sends.
   */
  let awaiting: { session: DispatchSession; signed: boolean } | null = null;
  /**
   * One nonce record per salt for as long as a signed message could still be
   * in date. A peer picks its own salt, and the same salt gives the same key,
   * so a fresh record for it would take again what was already taken once.
   */
  const keyed = new Map<string, { session: DispatchSession; at: number }>();
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
    if (patch.status !== undefined && patch.status !== 'waiting') options.presentPairing?.(null);
    state = { ...state, ...patch };
    options.onStateChanged(state);
  }

  async function send(action: string, payload: Record<string, unknown>): Promise<boolean> {
    if (!client || !dispatch || !proved) return false;
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
    if (!dispatch) {
      if (awaiting && verifyDispatchEnvelope(awaiting.session, signedEnvelopeFrom(payload)).ok) {
        awaiting.signed = true;
      }
      return;
    }
    const verified = verifyDispatchEnvelope(dispatch, signedEnvelopeFrom(payload));
    if (!verified.ok) {
      if (verified.reason === 'update_required') {
        publish({
          status: 'error',
          error: 'The phone runs an older AGI Mobile build. Update the app, then pair again.',
        });
      }
      return;
    }
    const inner = verified.envelope.payload;
    const firstSigned = !proved;
    if (firstSigned) trustPeer();
    if (!isRecord(inner)) return;
    const action = typeof inner['action'] === 'string' ? inner['action'] : verified.envelope.type;
    await handleSigned(action, inner);
    if (firstSigned && !ASKS_FOR_SESSIONS.has(action)) await sendSessions();
  }

  function trustPeer(): void {
    proved = true;
    allowedPhone = claimed;
    publish({ reconnectable: true });
    enqueue(flushPageTasks);
  }

  async function sendSessions(): Promise<void> {
    await controller.handleControl('code.sessions.list', {
      version: 1,
      requestId: `peer-proved-${Date.now()}`,
      sentAt: new Date().toISOString(),
    });
  }

  async function handleSigned(action: string, inner: Record<string, unknown>): Promise<void> {
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

  async function onPeerReady(
    metadata: Record<string, unknown> | null,
    eventGeneration: number,
  ): Promise<void> {
    const attempt = ++peerAttempt;
    dispatch = null;
    proved = false;
    claimed = null;
    awaiting = null;
    const salt = metadata?.['dispatchSalt'];
    const pairingCode = state.pairingCode;
    if (
      !pairingSecret ||
      !pairingCode ||
      typeof salt !== 'string' ||
      salt.length === 0 ||
      salt.length > MAX_SALT_LENGTH
    ) {
      publish({
        status: 'error',
        error: 'The phone did not offer a secure session. Update the app, then pair again.',
      });
      return;
    }
    const phoneName = sanitizePhoneName(metadata?.['deviceName']);
    const identity = phoneIdentity(metadata, phoneName);
    const secretAtReady = pairingSecret;
    options.presentPairing?.(null);
    let asked: { session: DispatchSession; signed: boolean };
    try {
      asked = { session: sessionKeyedBy(pairingCode, salt, secretAtReady), signed: false };
    } catch {
      publish({ status: 'error', error: 'Secure pairing could not start. Pair again.' });
      return;
    }
    const known = allowedPhone?.secret === secretAtReady && allowedPhone.identity === identity;
    let confirmed = known;
    if (!known) {
      awaiting = asked;
      try {
        confirmed = await options.confirmPhone({ name: phoneName, pairingCode });
      } catch {
        confirmed = false;
      }
    }
    if (eventGeneration !== generation || attempt !== peerAttempt) return;
    awaiting = null;
    if (!confirmed) {
      stop();
      return;
    }
    const secret = pairingSecret;
    if (!secret || secret !== secretAtReady) return;
    if (!known) controller.forget();
    dispatch = asked.session;
    // A phone taken back without being asked is shown under the name it was
    // allowed by, not the one this connection sent.
    const name = known && allowedPhone ? allowedPhone.name : phoneName;
    claimed = { secret, identity, name };
    publish({ status: 'connected', error: null, phoneName: name });
    if (asked.signed) {
      trustPeer();
      enqueue(sendSessions);
    }
  }

  function sessionKeyedBy(pairingCode: string, salt: string, secret: string): DispatchSession {
    const now = Date.now();
    const cutoff = now - DISPATCH_NONCE_CACHE_TTL_MS;
    for (const [used, entry] of keyed) {
      const inDate = [...entry.session.nonces.values()].some((takenAt) => takenAt >= cutoff);
      if (entry.at < cutoff && !inDate) keyed.delete(used);
    }
    const kept = keyed.get(salt);
    const session =
      kept?.session ?? createDispatchSession(deriveDispatchKey(pairingCode, salt, secret));
    keyed.set(salt, { session, at: now });
    return session;
  }

  function onEvent(event: SignalingEvent, eventGeneration: number): void {
    if (eventGeneration !== generation) return;
    switch (event.type) {
      case 'registered':
        if (active) active = { ...active, pairToken: event.pairToken };
        registered = true;
        reconnectAttempts = 0;
        if (state.status === 'reconnecting') {
          publish({ status: 'waiting', error: null });
          if (allowedPhone === null && active && pairingSecret) {
            options.presentPairing?.({
              code: active.code,
              qrPayload: `agiw3:${active.code}:${pairingSecret}`,
              expiresAt: active.expiresAt,
            });
          }
        }
        return;
      case 'peer_ready':
        void onPeerReady(event.metadata ?? null, eventGeneration);
        return;
      case 'signal':
        if (event.kind === 'control') enqueue(() => handleControl(event.payload));
        return;
      case 'peer_left':
        peerAttempt += 1;
        dispatch = null;
        proved = false;
        claimed = null;
        awaiting = null;
        controller.detach();
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
    peerAttempt += 1;
    client = null;
    dispatch = null;
    proved = false;
    claimed = null;
    awaiting = null;
    controller.detach();
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
    const request = parseStartRequest(
      args,
      options.allowInsecureLoopback === true,
      options.allowRelayUrl,
    );
    stop();
    pairingSecret = generatePairingSecret();
    active = request;
    publish({
      status: 'waiting',
      pairingCode: request.code,
      expiresAt: request.expiresAt,
      phoneName: null,
      attachedSessions: 0,
      reconnectable: false,
      error: null,
    });
    const qrPayload = `agiw3:${request.code}:${pairingSecret}`;
    if (options.presentPairing) {
      options.presentPairing({ code: request.code, qrPayload, expiresAt: request.expiresAt });
    } else {
      publish({ qrPayload });
    }
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
    peerAttempt += 1;
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    active = null;
    registered = false;
    reconnectAttempts = 0;
    options.presentPairing?.(null);
    client?.close({ endPairing: true });
    client = null;
    dispatch = null;
    proved = false;
    claimed = null;
    awaiting = null;
    keyed.clear();
    pairingSecret = null;
    allowedPhone = null;
    receipts.clear();
    pageTasks.clear();
    createdTasks.clear();
    controller.forget();
    if (state.status !== 'idle') publish({ ...IDLE_REMOTE_CONTROL_STATE });
    return state;
  }

  function handleSessionEvent(rootId: string, event: DeveloperSessionEvent): void {
    if (!dispatch || !proved) return;
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
