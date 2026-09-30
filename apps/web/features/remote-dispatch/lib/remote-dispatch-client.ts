import { SignalingClient } from '@agiworkforce/utils/signaling';
import type { DispatchTaskLifecycleStatus, SignalingEvent } from '@agiworkforce/types';
import { addCsrfHeaders } from '@/lib/client/csrf';
import type { BrowserPairing } from './browser-pairing';
import {
  createDispatchSession,
  newDispatchSalt,
  openDispatchEnvelope,
  signDispatchEnvelope,
} from './dispatch-envelope';

const CLAIM_PATH = '/api/pair/claim';
const HEARTBEAT_INTERVAL_MS = 25_000;
const BROWSER_METADATA = { deviceType: 'web', app: 'agiworkforce-web', deviceName: 'Web browser' };

const CLAIM_FAILURES: Readonly<Record<string, string>> = {
  pairing_not_found: 'This link has expired or was already used. Make a new one on your computer.',
  pairing_role_in_use:
    'Another device is already connected to this computer. Disconnect it there first.',
  pairing_belongs_to_another_account: 'That computer is signed in to a different account.',
};
const CLAIM_FAILED =
  'This browser could not connect to your computer. Make a new link and try again.';
const CONNECTION_LOST = 'The connection to your computer ended. Make a new link to connect again.';
const DEVICE_UNLINKED =
  'That computer was unlinked from your account, so it no longer takes tasks. Link it again from the computer to send it work.';
const RECEIPT_TIMEOUT_MS = 8_000;
const MAX_SEND_ATTEMPTS = 3;
const NOT_CONFIRMED =
  'Your computer has not confirmed this task, so it may or may not be running. Check AGI Cloud on the computer, or send it again.';

export interface RemoteTaskStatus {
  requestId: string;
  status: DispatchTaskLifecycleStatus;
  taskId?: string;
  message?: string;
  result?: string;
  error?: string;
  unconfirmed?: boolean;
}

interface RemoteDispatchHandlers {
  onReady: (computerName: string | null) => void;
  onAway: () => void;
  onTaskStatus: (status: RemoteTaskStatus) => void;
  onClosed: (message: string) => void;
}

export interface RemoteDispatchConnection {
  sendTask: (prompt: string, title: string) => Promise<string | null>;
  resendTask: (requestId: string) => Promise<boolean>;
  cancelTask: (requestId: string, taskId?: string) => Promise<boolean>;
  close: () => void;
}

interface ClaimedPairing {
  pairToken: string;
  wsUrl: string;
}

async function claimPairing(code: string): Promise<ClaimedPairing> {
  const response = await fetch(CLAIM_PATH, {
    method: 'POST',
    credentials: 'include',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ code }),
  });
  const body: unknown = await response.json().catch(() => null);
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  if (!response.ok) {
    const reason = typeof record['error'] === 'string' ? record['error'] : '';
    throw new Error(CLAIM_FAILURES[reason] ?? CLAIM_FAILED);
  }
  const { pairToken, wsUrl } = record;
  if (typeof pairToken !== 'string' || typeof wsUrl !== 'string') throw new Error(CLAIM_FAILED);
  return { pairToken, wsUrl };
}

function readTaskStatus(payload: unknown): RemoteTaskStatus | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  if (record['action'] !== 'dispatch.task.status') return null;
  const { requestId, status, taskId, message, result, error } = record;
  if (typeof requestId !== 'string' || typeof status !== 'string') return null;
  return {
    requestId,
    status: status as DispatchTaskLifecycleStatus,
    ...(typeof taskId === 'string' ? { taskId } : {}),
    ...(typeof message === 'string' ? { message } : {}),
    ...(typeof result === 'string' ? { result } : {}),
    ...(typeof error === 'string' ? { error } : {}),
  };
}

function readReceiptRequestId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  if (record['action'] !== 'control.receipt') return null;
  return typeof record['requestId'] === 'string' ? record['requestId'] : null;
}

function controlEnvelope(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const data = (payload as Record<string, unknown>)['data'];
  return data && typeof data === 'object' ? data : payload;
}

export async function connectRemoteDispatch(
  pairing: BrowserPairing,
  handlers: RemoteDispatchHandlers,
): Promise<RemoteDispatchConnection> {
  const claimed = await claimPairing(pairing.code);
  const dispatchSalt = newDispatchSalt();
  const session = await createDispatchSession(pairing.code, dispatchSalt, pairing.secret);
  let ended = false;
  const awaitingReceipt = new Map<string, ReturnType<typeof setTimeout>>();
  const sentTasks = new Map<string, () => Promise<boolean>>();
  const unconfirmed = new Set<string>();

  const stopAwaitingReceipts = () => {
    for (const timer of awaitingReceipt.values()) clearTimeout(timer);
    awaitingReceipt.clear();
  };

  const end = (message: string) => {
    if (ended) return;
    ended = true;
    stopAwaitingReceipts();
    client.close();
    handlers.onClosed(message);
  };

  const onEvent = (event: SignalingEvent) => {
    switch (event.type) {
      case 'peer_ready': {
        const name = event.metadata?.['deviceName'];
        handlers.onReady(typeof name === 'string' ? name : null);
        return;
      }
      case 'signal':
        if (event.kind !== 'control') return;
        void openDispatchEnvelope(session, controlEnvelope(event.payload)).then((opened) => {
          const received = readReceiptRequestId(opened);
          if (received !== null) {
            clearTimeout(awaitingReceipt.get(received));
            awaitingReceipt.delete(received);
            if (unconfirmed.delete(received)) {
              handlers.onTaskStatus({
                requestId: received,
                status: 'accepted',
                message: '',
                unconfirmed: false,
              });
            }
            return;
          }
          const status = readTaskStatus(opened);
          if (status) handlers.onTaskStatus(status);
        });
        return;
      case 'peer_left':
        handlers.onAway();
        return;
      case 'error':
        // The relay names a revoked device before it closes the socket; the
        // close that follows would otherwise say only that the link dropped.
        if (event.error === 'device_revoked') end(DEVICE_UNLINKED);
        return;
      case 'session_expired':
      case 'terminated':
      case 'close':
        end(CONNECTION_LOST);
        return;
      default:
        return;
    }
  };

  const client = new SignalingClient({
    allowInsecureLoopback: process.env['NODE_ENV'] === 'development',
    wsUrl: claimed.wsUrl,
    code: pairing.code,
    role: 'mobile',
    pairToken: claimed.pairToken,
    metadata: { ...BROWSER_METADATA, dispatchSalt },
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    onEvent,
  });

  const send = async (action: string, payload: Record<string, unknown>): Promise<boolean> => {
    if (ended) return false;
    const envelope = await signDispatchEnvelope(session, action, { ...payload, action });
    return client.sendSignal('control', { action, data: envelope });
  };

  const giveUp = (requestId: string) => {
    if (ended) return;
    unconfirmed.add(requestId);
    handlers.onTaskStatus({
      requestId,
      status: 'queued',
      message: NOT_CONFIRMED,
      unconfirmed: true,
    });
  };

  const awaitReceipt = (requestId: string, resend: () => Promise<boolean>, attempt: number) => {
    awaitingReceipt.set(
      requestId,
      setTimeout(() => {
        awaitingReceipt.delete(requestId);
        if (ended) return;
        if (attempt >= MAX_SEND_ATTEMPTS) {
          giveUp(requestId);
          return;
        }
        void resend().then((sent) => {
          if (sent) awaitReceipt(requestId, resend, attempt + 1);
          else giveUp(requestId);
        });
      }, RECEIPT_TIMEOUT_MS),
    );
  };

  return {
    sendTask: async (prompt, title) => {
      const requestId = crypto.randomUUID();
      const task = { version: 1, requestId, prompt, title, sentAt: new Date().toISOString() };
      const resend = () => send('dispatch.task.create', task);
      if (!(await resend())) return null;
      sentTasks.set(requestId, resend);
      awaitReceipt(requestId, resend, 1);
      return requestId;
    },
    resendTask: async (requestId) => {
      const resend = sentTasks.get(requestId);
      if (!resend || awaitingReceipt.has(requestId) || !(await resend())) return false;
      handlers.onTaskStatus({ requestId, status: 'queued', message: '', unconfirmed: false });
      awaitReceipt(requestId, resend, 1);
      return true;
    },
    cancelTask: (requestId, taskId) =>
      send('dispatch.task.cancel', {
        version: 1,
        requestId,
        ...(taskId ? { taskId } : {}),
        sentAt: new Date().toISOString(),
      }),
    close: () => {
      ended = true;
      stopAwaitingReceipts();
      client.close({ endPairing: true });
    },
  };
}
