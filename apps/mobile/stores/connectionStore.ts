import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import { SignalingClient } from '@agiworkforce/utils/signaling';
import type { SignalingEvent, SignalKind } from '@agiworkforce/types';
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } from 'react-native-webrtc';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import {
  deriveDispatchSecret,
  signMessage,
  verifyMessage,
  type HmacSessionState,
} from '@/lib/dispatchHmac';
import { parseAgent, MAX_AGENTS_PER_UPDATE } from '@/lib/dispatchAgentValidator';
import { createControlAckTracker, type ControlDelivery } from '@/lib/controlAckTracker';

interface RTCConfiguration {
  iceServers?: Array<{ urls: string | string[]; username?: string; credential?: string }>;
  iceTransportPolicy?: 'all' | 'relay';
  bundlePolicy?: 'balanced' | 'max-bundle' | 'max-compat';
  rtcpMuxPolicy?: 'require' | 'negotiate';
  iceCandidatePoolSize?: number;
}

interface RTCIceCandidateInit {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}
import { WS_URL } from '@/lib/constants';
import { useAgentStore } from './agentStore';
import type { Agent } from './agentStore';
import { notifyCompanionMessage } from '@/services/companionNotifications';
import type { ApprovalRequest, RiskLevel } from '@/types/chat';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { useDispatchTaskStore } from './dispatchTaskStore';
import type {
  ControlReceiptEvent,
  ControlReceiptOutcome,
  DispatchTaskLifecycleStatus,
  DispatchTaskStatusEvent,
} from '@agiworkforce/types';
import { claimManualPairingToken, normalizePairingInput } from '@/services/manualPairing';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'stale'
  | 'reconnecting'
  | 'session_expired';

export type ConnectionQuality = 'strong' | 'weak' | 'disconnected';

export interface DesktopMetadata {
  deviceName?: string;
  platform?: string;
  version?: string;
  os?: string;
  [key: string]: unknown;
}

export type { ControlDelivery };

interface ConnectionState {
  status: ConnectionStatus;
  pairingCode: string | null;
  pairToken: string | null;
  desktopName: string | null;
  desktopMetadata: DesktopMetadata | null;
  error: string | null;
  sessionExpiresAt: number | null;
  lastHeartbeatAt: number | null;
  lastHeartbeatLatencyMs: number | null;
  missedHeartbeats: number;
  reconnectCountdown: number;
  connectionQuality: ConnectionQuality;
  reconnectAttempts: number;
  reconnectSuccesses: number;
  lastReconnectDurationMs: number | null;
  reconnectStartedAt: number | null;
  unacknowledgedControls: number;
  lastControlDelivery: ControlDelivery | null;

  connect: (code: string) => void;
  disconnect: () => void;
  sendControl: (action: string, payload?: unknown) => Promise<boolean>;
  queueControl: (action: string, payload?: unknown) => void;
  clearError: () => void;
  recordHeartbeat: (latencyMs?: number) => void;
  markStale: () => void;
  beginReconnecting: (countdownSeconds: number) => void;
  tickReconnectCountdown: () => void;
  markSessionExpired: () => void;
}

let signalingClient: SignalingClient | null = null;

let connectionAttemptId = 0;

function invalidateConnectionAttempt(): void {
  connectionAttemptId += 1;
}

function isCurrentConnectionAttempt(attemptId: number): boolean {
  return attemptId === connectionAttemptId;
}

const CONNECT_WATCHDOG_MS = 25_000;
let connectWatchdogTimer: ReturnType<typeof setTimeout> | undefined;

function clearConnectWatchdog(): void {
  if (connectWatchdogTimer !== undefined) {
    clearTimeout(connectWatchdogTimer);
    connectWatchdogTimer = undefined;
  }
}

function startConnectWatchdog(attemptId: number): void {
  clearConnectWatchdog();
  connectWatchdogTimer = setTimeout(() => {
    connectWatchdogTimer = undefined;
    if (!isCurrentConnectionAttempt(attemptId)) return;
    if (useConnectionStore.getState().status !== 'connecting') return;

    invalidateConnectionAttempt();
    if (signalingClient) {
      signalingClient.close();
      signalingClient = null;
    }
    cleanupPeerConnection();
    hmacState = null;
    pendingControlQueue.length = 0;
    clearPendingControlAcks();
    useConnectionStore.setState({
      status: 'error',
      error: null,
      connectionQuality: 'disconnected',
      reconnectStartedAt: null,
    });
  }, CONNECT_WATCHDOG_MS);
}

let hmacState: HmacSessionState | null = null;

const pendingControlQueue: Array<{ action: string; payload: unknown }> = [];
const MAX_PENDING_QUEUE = 200;

export const CONTROL_ACK_TIMEOUT_MS = 8_000;
export const MAX_CONTROL_ACK_ATTEMPTS = 3;
const MAX_PENDING_CONTROL_ACKS = 50;

const controlAckTracker = createControlAckTracker({
  timeoutMs: CONTROL_ACK_TIMEOUT_MS,
  maxAttempts: MAX_CONTROL_ACK_ATTEMPTS,
  maxPending: MAX_PENDING_CONTROL_ACKS,
  resend: (action, payload) => {
    void useConnectionStore.getState().sendControl(action, payload);
  },
  onChange: (pendingCount, delivery) => {
    useConnectionStore.setState({
      unacknowledgedControls: pendingCount,
      ...(delivery ? { lastControlDelivery: delivery } : {}),
    });
  },
});

function clearPendingControlAcks(): void {
  controlAckTracker.clear();
  useConnectionStore.setState({ lastControlDelivery: null });
}

async function flushPendingControlQueue(): Promise<void> {
  if (pendingControlQueue.length === 0) return;
  const store = useConnectionStore.getState();
  while (pendingControlQueue.length > 0) {
    const msg = pendingControlQueue.shift();
    if (msg) {
      const accepted = await store.sendControl(msg.action, msg.payload);
      if (!accepted) {
        pendingControlQueue.unshift(msg);
        return;
      }
    }
  }
}

let peerConnection: RTCPeerConnection | null = null;

type RTCDataChannelType = ReturnType<RTCPeerConnection['createDataChannel']>;

interface RTCSessionDescriptionInit {
  sdp: string;
  type: string;
}

let dataChannel: RTCDataChannelType | null = null;

/**
 * Parse the pairing payload from a QR string.
 * Accepts raw codes, `agiw:XXXXXXXXXXXX`, or `agiw:XXXXXXXXXXXX:<64-hex-token>`.
 *
 * AUDIT-FIX: H-12 — server now mints 12-character codes from a 36-symbol
 * alphabet (36^12 ≈ 62 bits of entropy).
 * We strip out human-readable separators (spaces or '-') that the desktop
 * UI may print to display the code as 3 groups of 4. Matches against
 * `/^[A-Z0-9]{12}$/`; legacy short codes are rejected.
 */
function parsePairingPayload(raw: string): { code: string; pairToken: string | null } {
  const trimmed = normalizePairingInput(raw);
  if (trimmed.startsWith('agiw:')) {
    const [code = '', token] = trimmed.slice(5).split(':');
    return {
      code: code.toUpperCase(),
      pairToken: token && /^[a-fA-F0-9]{64}$/.test(token) ? token.toLowerCase() : null,
    };
  }
  return { code: trimmed.toUpperCase(), pairToken: null };
}

function isDispatchCompanionEnabled(): boolean {
  return FEATURES.dispatch && FEATURES.companion;
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const RELAY_ACTION_ALIASES: Record<string, string> = {
  request_agents_refresh: 'sync_request',
  ping: 'heartbeat',
  pong: 'heartbeat_ack',
};

function resolveRelayAction(action: string, payload?: unknown): string {
  if (action === 'agent_command' && isObject(payload) && payload['command'] === 'cancel') {
    return 'cancel';
  }
  if (action === 'emergency_stop') return 'cancel';
  return RELAY_ACTION_ALIASES[action] ?? action;
}

function toControlData(payload?: unknown): Record<string, unknown> {
  if (payload === undefined || payload === null) return {};
  if (isObject(payload)) return payload;
  return { value: payload };
}

export interface RelayControlMessage {
  action: string;
  data: Record<string, unknown>;
}

export function buildRelayControlMessage(
  action: string,
  payload?: unknown,
): {
  relay: RelayControlMessage;
  innerPayload: Record<string, unknown>;
} {
  const data = toControlData(payload);
  const relayAction = resolveRelayAction(action, data);
  const innerPayload: Record<string, unknown> = { ...data, action: relayAction };

  if (action === 'emergency_stop') {
    innerPayload['scope'] = innerPayload['scope'] ?? 'all';
  }

  return {
    relay: {
      action: relayAction,
      data: innerPayload,
    },
    innerPayload,
  };
}

function isSignedEnvelopeLike(value: unknown): value is Record<string, unknown> {
  return isObject(value) && typeof value['hmac'] === 'string';
}

function getSignedEnvelopeCandidate(envelope: unknown): unknown {
  if (!isObject(envelope)) return envelope;

  const data = envelope['data'];
  if (isSignedEnvelopeLike(data)) return data;

  if (isObject(data) && isSignedEnvelopeLike(data['envelope'])) {
    return data['envelope'];
  }

  return envelope;
}

function normalizeIncomingControlPayload(payload: unknown): Record<string, unknown> | null {
  if (!isObject(payload)) return null;

  const action = isString(payload['action']) ? payload['action'] : undefined;
  if (!action) return payload;

  const data = isObject(payload['data']) ? payload['data'] : undefined;
  if (!data) return payload;

  return {
    ...data,
    action,
  };
}

const VALID_RISK_LEVELS = new Set<RiskLevel>(['low', 'medium', 'high']);
const VALID_APPROVAL_TYPES = new Set<ApprovalRequest['type']>([
  'file_delete',
  'command',
  'api_call',
  'data_modification',
  'other',
]);
const VALID_DISPATCH_TASK_STATUSES = new Set<DispatchTaskLifecycleStatus>([
  'accepted',
  'queued',
  'running',
  'awaiting_input',
  'ready_for_review',
  'completed',
  'failed',
  'cancelled',
  'rejected',
]);

function boundedString(v: unknown, max: number): string | undefined {
  if (!isString(v)) return undefined;
  const trimmed = v.trim();
  if (!trimmed || trimmed.length > max) return undefined;
  return trimmed;
}

function parseRiskLevel(v: unknown): RiskLevel | null {
  if (v === undefined || v === null) return 'medium';
  return isString(v) && VALID_RISK_LEVELS.has(v as RiskLevel) ? (v as RiskLevel) : null;
}

function parseApprovalType(v: unknown): ApprovalRequest['type'] | null {
  if (v === undefined || v === null) return 'other';
  return isString(v) && VALID_APPROVAL_TYPES.has(v as ApprovalRequest['type'])
    ? (v as ApprovalRequest['type'])
    : null;
}

export function parseApprovalRequest(payload: unknown): ApprovalRequest | null {
  const normalized = normalizeIncomingControlPayload(payload);
  if (!normalized || (normalized['version'] !== undefined && normalized['version'] !== 1)) {
    return null;
  }

  const id =
    boundedString(normalized['id'], 128) ??
    boundedString(normalized['requestId'], 128) ??
    boundedString(normalized['approvalId'], 128);
  const toolName =
    boundedString(normalized['toolName'], 120) ??
    boundedString(normalized['taskName'], 120) ??
    boundedString(normalized['tool'], 120);
  const description =
    boundedString(normalized['description'], 1000) ??
    boundedString(normalized['message'], 1000) ??
    boundedString(normalized['summary'], 1000);
  const riskLevel = parseRiskLevel(
    normalized['riskLevel'] ?? normalized['risk_level'] ?? normalized['risk'],
  );
  const type = parseApprovalType(
    normalized['type'] ?? normalized['approvalType'] ?? normalized['actionType'],
  );

  if (!id || !toolName || !description || !riskLevel || !type) return null;

  const createdAt =
    normalized['createdAt'] === undefined ? undefined : boundedString(normalized['createdAt'], 64);
  const expiresAt =
    normalized['expiresAt'] === undefined ? undefined : boundedString(normalized['expiresAt'], 64);
  const countdown =
    isNumber(normalized['countdown']) &&
    Number.isInteger(normalized['countdown']) &&
    normalized['countdown'] >= 0 &&
    normalized['countdown'] <= 3_600
      ? normalized['countdown']
      : undefined;
  if (
    (normalized['createdAt'] !== undefined &&
      (!createdAt || !Number.isFinite(Date.parse(createdAt)))) ||
    (normalized['expiresAt'] !== undefined &&
      (!expiresAt || !Number.isFinite(Date.parse(expiresAt)))) ||
    (normalized['countdown'] !== undefined && countdown === undefined)
  ) {
    return null;
  }

  return {
    id,
    toolName,
    description,
    riskLevel,
    type,
    status: 'pending',
    ...(createdAt ? { createdAt } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    ...(countdown !== undefined ? { countdown } : {}),
  };
}

export function ingestApprovalRequestPayload(payload: unknown): boolean {
  const normalized = normalizeIncomingControlPayload(payload);
  const approval = parseApprovalRequest(normalized);
  if (!normalized || !approval) return false;

  const existing = useAgentStore
    .getState()
    .pendingApprovals.find((candidate) => candidate.id === approval.id);
  useAgentStore.getState().addApproval(approval);
  if (!existing || existing.status !== 'pending') {
    notifyCompanionMessage({ ...normalized, action: 'approval_request' });
  }
  return true;
}

export function ingestApprovalClosedPayload(payload: unknown): boolean {
  const normalized = normalizeIncomingControlPayload(payload);
  if (!normalized || normalized['version'] !== 1 || normalized['action'] !== 'approval_closed') {
    return false;
  }

  const requestId = boundedString(normalized['requestId'], 128);
  const closedAt = boundedString(normalized['closedAt'], 64);
  if (!requestId || !closedAt || !Number.isFinite(Date.parse(closedAt))) return false;

  useAgentStore.getState().removeApproval(requestId);
  return true;
}

export function ingestApprovalSnapshotPayload(payload: unknown): boolean {
  const normalized = normalizeIncomingControlPayload(payload);
  if (
    !normalized ||
    normalized['version'] !== 1 ||
    normalized['action'] !== 'approval_snapshot' ||
    !Array.isArray(normalized['pendingRequestIds']) ||
    normalized['pendingRequestIds'].length > 50
  ) {
    return false;
  }

  const syncedAt = boundedString(normalized['syncedAt'], 64);
  const pendingRequestIds = normalized['pendingRequestIds'].map((value) =>
    boundedString(value, 128),
  );
  if (
    !syncedAt ||
    !Number.isFinite(Date.parse(syncedAt)) ||
    pendingRequestIds.some((value) => value === undefined)
  ) {
    return false;
  }

  useAgentStore.getState().reconcileApprovals(pendingRequestIds as string[]);
  return true;
}

export function parseDispatchTaskStatus(payload: unknown): DispatchTaskStatusEvent | null {
  const normalized = normalizeIncomingControlPayload(payload);
  if (
    !normalized ||
    normalized['action'] !== 'dispatch.task.status' ||
    normalized['version'] !== 1
  ) {
    return null;
  }

  const requestId = boundedString(normalized['requestId'], 128);
  const statusValue = normalized['status'];
  const updatedAt = boundedString(normalized['updatedAt'], 64);
  if (
    !requestId ||
    !isString(statusValue) ||
    !VALID_DISPATCH_TASK_STATUSES.has(statusValue as DispatchTaskLifecycleStatus) ||
    !updatedAt ||
    !Number.isFinite(Date.parse(updatedAt))
  ) {
    return null;
  }

  const taskId =
    normalized['taskId'] === undefined ? undefined : boundedString(normalized['taskId'], 128);
  const message =
    normalized['message'] === undefined ? undefined : boundedString(normalized['message'], 4_000);
  const result =
    normalized['result'] === undefined ? undefined : boundedString(normalized['result'], 4_000);
  const error =
    normalized['error'] === undefined ? undefined : boundedString(normalized['error'], 4_000);
  if (
    (normalized['taskId'] !== undefined && !taskId) ||
    (normalized['message'] !== undefined && !message) ||
    (normalized['result'] !== undefined && !result) ||
    (normalized['error'] !== undefined && !error)
  ) {
    return null;
  }

  return {
    action: 'dispatch.task.status',
    version: 1,
    requestId,
    ...(taskId ? { taskId } : {}),
    status: statusValue as DispatchTaskLifecycleStatus,
    ...(message ? { message } : {}),
    ...(result ? { result } : {}),
    ...(error ? { error } : {}),
    updatedAt,
  };
}

const VALID_CONTROL_RECEIPT_OUTCOMES = new Set<ControlReceiptOutcome>([
  'accepted',
  'duplicate',
  'rejected',
]);

export function parseControlReceipt(payload: unknown): ControlReceiptEvent | null {
  const normalized = normalizeIncomingControlPayload(payload);
  if (!normalized || normalized['action'] !== 'control.receipt' || normalized['version'] !== 1) {
    return null;
  }

  const requestId = boundedString(normalized['requestId'], 128);
  const controlAction = boundedString(normalized['controlAction'], 128);
  const receivedAt = boundedString(normalized['receivedAt'], 64);
  const outcome = normalized['outcome'];
  if (
    !requestId ||
    !controlAction ||
    !receivedAt ||
    !Number.isFinite(Date.parse(receivedAt)) ||
    !isString(outcome) ||
    !VALID_CONTROL_RECEIPT_OUTCOMES.has(outcome as ControlReceiptOutcome)
  ) {
    return null;
  }

  const reason =
    normalized['reason'] === undefined ? undefined : boundedString(normalized['reason'], 500);
  if (normalized['reason'] !== undefined && !reason) return null;

  return {
    action: 'control.receipt',
    version: 1,
    requestId,
    controlAction,
    outcome: outcome as ControlReceiptOutcome,
    ...(reason ? { reason } : {}),
    receivedAt,
  };
}

async function handleControlMessageAsync(envelope: unknown): Promise<void> {
  if (!isDispatchCompanionEnabled()) return;
  if (!hmacState) {
    console.warn('[dispatch] Message rejected: missing_hmac_state');
    return;
  }

  let payload: unknown = envelope;
  const envelopeToVerify = getSignedEnvelopeCandidate(envelope);

  const result = await verifyMessage(hmacState, envelopeToVerify);
  if (!result.ok) {
    console.warn('[dispatch] Message rejected:', result.reason);
    return;
  }

  const isSignedEnvelope =
    typeof envelopeToVerify === 'object' &&
    envelopeToVerify !== null &&
    typeof (envelopeToVerify as Record<string, unknown>)['hmac'] === 'string';
  if (!isSignedEnvelope) {
    console.warn('[dispatch] Message rejected: unsigned_transitional');
    return;
  }
  payload = (envelopeToVerify as { payload: unknown }).payload;

  handleControlMessageInner(payload);
}

function handleControlMessage(payload: unknown): void {
  handleControlMessageAsync(payload).catch((err) => {
    console.warn('[dispatch] handleControlMessageAsync error:', err);
  });
}

function handleControlMessageInner(payload: unknown): void {
  const normalizedPayload = normalizeIncomingControlPayload(payload);
  if (!normalizedPayload) return;
  const action = isString(normalizedPayload['action']) ? normalizedPayload['action'] : undefined;
  if (!action) return;

  switch (action) {
    case 'agents_update': {
      const agents = normalizedPayload['agents'];
      if (Array.isArray(agents)) {
        const capped = agents.slice(0, MAX_AGENTS_PER_UPDATE);
        const valid: Agent[] = [];
        for (const raw of capped) {
          const parsed = parseAgent(raw);
          if (parsed) valid.push(parsed);
        }
        useAgentStore.getState().setAgents(valid);
      }
      break;
    }
    case 'agent_update': {
      const agentId = isString(normalizedPayload['agentId'])
        ? normalizedPayload['agentId']
        : undefined;
      const patch = isObject(normalizedPayload['patch']) ? normalizedPayload['patch'] : undefined;
      if (agentId && patch) {
        const existing = useAgentStore.getState().agents.find((a) => a.id === agentId);
        if (existing) {
          const candidate = parseAgent({ ...existing, ...patch, id: agentId });
          if (candidate) {
            const { id: _id, ...validatedPatch } = candidate;
            useAgentStore.getState().updateAgent(agentId, validatedPatch);
          }
        }
      }
      break;
    }
    case 'agent_removed': {
      const agentId = isString(normalizedPayload['agentId'])
        ? normalizedPayload['agentId']
        : undefined;
      if (agentId) {
        useAgentStore.getState().removeAgent(agentId);
      }
      break;
    }
    case 'pong': {
      const pingTimestamp = isNumber(normalizedPayload['timestamp'])
        ? normalizedPayload['timestamp']
        : undefined;
      const now = Date.now();
      const latencyMs =
        pingTimestamp != null && pingTimestamp <= now ? now - pingTimestamp : undefined;
      useConnectionStore.getState().recordHeartbeat(latencyMs);
      break;
    }
    case 'heartbeat_ack': {
      const pingTimestamp = isNumber(normalizedPayload['timestamp'])
        ? normalizedPayload['timestamp']
        : undefined;
      const now = Date.now();
      const latencyMs =
        pingTimestamp != null && pingTimestamp <= now ? now - pingTimestamp : undefined;
      useConnectionStore.getState().recordHeartbeat(latencyMs);
      break;
    }
    case 'approval_request': {
      ingestApprovalRequestPayload(normalizedPayload);
      break;
    }
    case 'approval_closed': {
      ingestApprovalClosedPayload(normalizedPayload);
      break;
    }
    case 'approval_snapshot': {
      ingestApprovalSnapshotPayload(normalizedPayload);
      break;
    }
    case 'dispatch.task.status': {
      const event = parseDispatchTaskStatus(normalizedPayload);
      if (event) useDispatchTaskStore.getState().applyStatus(event);
      break;
    }
    case 'control.receipt': {
      const receipt = parseControlReceipt(normalizedPayload);
      if (receipt) controlAckTracker.resolve(receipt.requestId, receipt.outcome);
      break;
    }
    case 'agent_failed':
    case 'emergency_stop':
    case 'task_completed':
    case 'agent_paused':
    case 'heartbeat_lost': {
      notifyCompanionMessage({ ...normalizedPayload, action });
      break;
    }
    default:
      break;
  }
}

function setupPeerConnection(): void {
  cleanupPeerConnection();

  const config: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  const pc = new RTCPeerConnection(config);
  peerConnection = pc;

  (pc as unknown as Record<string, unknown>).onicecandidate = (event: {
    candidate: RTCIceCandidate | null;
  }) => {
    if (event.candidate && signalingClient) {
      signalingClient.sendSignal('ice', {
        candidate: event.candidate.toJSON(),
      });
    }
  };

  (pc as unknown as Record<string, unknown>).ondatachannel = (event: {
    channel: RTCDataChannelType;
  }) => {
    dataChannel = event.channel;
    if (dataChannel) {
      setupDataChannel(dataChannel);
    }
  };

  (pc as unknown as Record<string, unknown>).onconnectionstatechange = () => {
    // Connection state change handled silently — reconnection logic in signaling layer
  };
}

function setupDataChannel(channel: RTCDataChannelType): void {
  const ch = channel as unknown as Record<string, unknown>;

  ch.onopen = () => {
    void flushPendingControlQueue();
  };

  ch.onmessage = (event: { data: string }) => {
    try {
      const parsed = JSON.parse(String(event.data));
      handleControlMessage(parsed);
    } catch {
      // Malformed DataChannel message — ignore
    }
  };

  ch.onclose = () => {
    dataChannel = null;
  };
}

async function handleSignalingMessage(kind: SignalKind, payload: unknown): Promise<void> {
  if (!peerConnection) return;
  const data = payload as Record<string, unknown>;

  try {
    switch (kind) {
      case 'offer': {
        const sdp = data['sdp'] as RTCSessionDescriptionInit;
        if (sdp) {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));

          const answer = await peerConnection.createAnswer();

          await peerConnection.setLocalDescription(answer);
          signalingClient?.sendSignal('answer', { sdp: answer });
        }
        break;
      }
      case 'answer': {
        const sdp = data['sdp'] as RTCSessionDescriptionInit;
        if (sdp) {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
        }
        break;
      }
      case 'ice': {
        const candidate = data['candidate'] as RTCIceCandidateInit;
        if (candidate) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
        break;
      }
      default:
        break;
    }
  } catch {
    // WebRTC signaling error — falls back to relay
  }
}

function cleanupPeerConnection(): void {
  if (dataChannel) {
    try {
      dataChannel.close();
    } catch {
      // ignore
    }
    dataChannel = null;
  }
  if (peerConnection) {
    try {
      peerConnection.close();
    } catch {
      // ignore
    }
    peerConnection = null;
  }
}

function deriveConnectionQuality(
  latencyMs: number | null,
  missedHeartbeats: number,
  status: ConnectionStatus,
): ConnectionQuality {
  if (status === 'disconnected' || status === 'error' || status === 'session_expired') {
    return 'disconnected';
  }
  if (missedHeartbeats >= 2 || status === 'stale') return 'disconnected';
  if (latencyMs === null) return 'weak';
  if (latencyMs < 200) return 'strong';
  if (latencyMs < 800) return 'weak';
  return 'disconnected';
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set, get) => ({
      status: 'disconnected',
      pairingCode: null,
      pairToken: null,
      desktopName: null,
      desktopMetadata: null,
      error: null,
      sessionExpiresAt: null,
      lastHeartbeatAt: null,
      lastHeartbeatLatencyMs: null,
      missedHeartbeats: 0,
      reconnectCountdown: 0,
      connectionQuality: 'disconnected',
      reconnectAttempts: 0,
      reconnectSuccesses: 0,
      lastReconnectDurationMs: null,
      reconnectStartedAt: null,
      unacknowledgedControls: 0,
      lastControlDelivery: null,

      connect: (rawCode: string) => {
        if (!isDispatchCompanionEnabled()) {
          invalidateConnectionAttempt();
          get().disconnect();
          return;
        }

        const currentState = get();
        const isReconnect =
          currentState.status === 'stale' || currentState.status === 'reconnecting';
        if (currentState.status === 'connecting' || currentState.status === 'connected') {
          get().disconnect();
        }

        const attemptId = ++connectionAttemptId;
        const parsed = parsePairingPayload(rawCode);
        const suppliedPairToken =
          parsed.pairToken ??
          (parsed.code === currentState.pairingCode ? currentState.pairToken : null);

        set((state) => ({
          status: 'connecting',
          pairingCode: parsed.code,
          pairToken: suppliedPairToken,
          error: null,
          desktopName: null,
          desktopMetadata: null,
          sessionExpiresAt: null,
          reconnectAttempts: isReconnect ? state.reconnectAttempts + 1 : state.reconnectAttempts,
          reconnectStartedAt: isReconnect ? Date.now() : state.reconnectStartedAt,
        }));

        startConnectWatchdog(attemptId);

        void (async () => {
          let pairToken = suppliedPairToken;
          let signalingWsUrl = WS_URL;
          if (!pairToken) {
            try {
              const claim = await claimManualPairingToken(parsed.code);
              if (!isCurrentConnectionAttempt(attemptId)) return;
              pairToken = claim.pairToken;
              signalingWsUrl = claim.wsUrl;
              set({ pairToken, sessionExpiresAt: claim.expiresAt });
            } catch (error) {
              if (!isCurrentConnectionAttempt(attemptId)) return;
              clearConnectWatchdog();
              set({
                status: 'error',
                error:
                  error instanceof Error
                    ? error.message
                    : 'Manual pairing failed. Generate a new code and try again.',
                pairingCode: parsed.code,
                pairToken: null,
                connectionQuality: 'disconnected',
                reconnectStartedAt: null,
              });
              return;
            }
          }

          const appVersion = Constants.expoConfig?.version ?? '0.0.0';

          if (!isCurrentConnectionAttempt(attemptId)) return;

          const sessionMetadata: {
            deviceType: string;
            app: string;
            version: string;
            dispatchSalt: string;
          } = {
            deviceType: 'mobile',
            app: 'agiworkforce-mobile',
            version: appVersion,
            dispatchSalt: '',
          };

          try {
            const saltBytes = await Crypto.getRandomBytesAsync(16);
            let hex = '';
            for (let i = 0; i < saltBytes.length; i++) {
              hex += (saltBytes[i] as number).toString(16).padStart(2, '0');
            }
            sessionMetadata.dispatchSalt = hex;
            const secret = await deriveDispatchSecret(parsed.code, hex);
            if (!isCurrentConnectionAttempt(attemptId)) return;
            hmacState = { secret, nonceCache: new Map() };
          } catch (err) {
            if (!isCurrentConnectionAttempt(attemptId)) return;
            console.warn('[dispatch] HMAC secret derivation failed:', err);
            hmacState = null;
            pendingControlQueue.length = 0;
            clearPendingControlAcks();
            clearConnectWatchdog();
            set({
              status: 'error',
              error:
                'Secure pairing could not start. Generate a new QR code and try pairing again.',
              pairingCode: parsed.code,
              pairToken,
              connectionQuality: 'disconnected',
              reconnectStartedAt: null,
            });
            return;
          }

          if (!isCurrentConnectionAttempt(attemptId)) return;

          setupPeerConnection();

          signalingClient = new SignalingClient({
            wsUrl: signalingWsUrl,
            code: parsed.code,
            role: 'mobile',
            pairToken,
            metadata: sessionMetadata,
            heartbeatIntervalMs: 25000,
            onEvent: (event: SignalingEvent) => {
              if (!isCurrentConnectionAttempt(attemptId)) return;
              switch (event.type) {
                case 'open':
                  break;

                case 'registered':
                  set({ sessionExpiresAt: event.expiresAt });
                  if (event.peerConnected) {
                    set({ status: 'connecting' });
                  }
                  break;

                case 'peer_ready': {
                  clearConnectWatchdog();
                  const metadata = (event.metadata ?? {}) as DesktopMetadata;
                  const wasReconnecting =
                    get().status === 'reconnecting' ||
                    get().status === 'stale' ||
                    get().status === 'connecting';
                  const reconnectStart = get().reconnectStartedAt;
                  const reconnectDuration =
                    wasReconnecting && reconnectStart != null
                      ? Date.now() - reconnectStart
                      : get().lastReconnectDurationMs;

                  set((state) => ({
                    status: 'connected',
                    desktopName: (metadata.deviceName as string) ?? 'Desktop',
                    desktopMetadata: metadata,
                    error: null,
                    lastHeartbeatAt: Date.now(),
                    missedHeartbeats: 0,
                    connectionQuality: 'weak', // will be updated on first pong with latency
                    reconnectSuccesses: wasReconnecting
                      ? state.reconnectSuccesses + 1
                      : state.reconnectSuccesses,
                    lastReconnectDurationMs: reconnectDuration,
                    reconnectStartedAt: null,
                  }));

                  void flushPendingControlQueue();
                  useAgentStore.getState().setAgents([]);
                  break;
                }

                case 'signal':
                  if (event.kind === 'control') {
                    handleControlMessage(event.payload);
                  } else {
                    handleSignalingMessage(event.kind, event.payload).catch(() => {
                      // Signaling message handling failed — ignore
                    });
                  }
                  break;

                case 'peer_left':
                  set({
                    status: 'disconnected',
                    desktopName: null,
                    desktopMetadata: null,
                  });
                  cleanupPeerConnection();
                  useAgentStore.getState().setAgents([]);
                  break;

                case 'session_expired':
                  get().markSessionExpired();
                  break;

                case 'terminated':
                  clearConnectWatchdog();
                  set({
                    status: 'disconnected',
                    pairingCode: null,
                    pairToken: null,
                    desktopName: null,
                    desktopMetadata: null,
                  });
                  cleanupPeerConnection();
                  signalingClient = null;
                  break;

                case 'error':
                  clearConnectWatchdog();
                  set({
                    status: 'error',
                    error: friendlyErrorMessage(event.error),
                  });
                  break;

                case 'close':
                  clearConnectWatchdog();
                  if (get().status !== 'error') {
                    set({ status: 'disconnected' });
                  }
                  cleanupPeerConnection();
                  signalingClient = null;
                  break;
              }
            },
          });
        })();
      },

      recordHeartbeat: (latencyMs?: number) => {
        const currentStatus = get().status;
        const missed = 0;
        const quality = deriveConnectionQuality(
          latencyMs ?? get().lastHeartbeatLatencyMs,
          missed,
          currentStatus === 'stale' || currentStatus === 'reconnecting'
            ? 'connected'
            : currentStatus,
        );
        set({
          lastHeartbeatAt: Date.now(),
          missedHeartbeats: 0,
          lastHeartbeatLatencyMs: latencyMs ?? get().lastHeartbeatLatencyMs,
          connectionQuality: quality,
        });
        if (currentStatus === 'stale' || currentStatus === 'reconnecting') {
          set({ status: 'connected' });
          void flushPendingControlQueue();
          useAgentStore.getState().setAgents([]);
        }
      },

      markStale: () => {
        const current = get();
        if (current.status !== 'connected' && current.status !== 'stale') return;
        const missed = current.missedHeartbeats + 1;
        set({
          missedHeartbeats: missed,
          connectionQuality: missed >= 1 ? 'weak' : current.connectionQuality,
        });
        if (missed >= 2) {
          set({ status: 'stale', connectionQuality: 'disconnected' });
        }
      },

      queueControl: (action: string, payload?: unknown) => {
        if (!isDispatchCompanionEnabled()) return;
        if (pendingControlQueue.length >= MAX_PENDING_QUEUE) {
          pendingControlQueue.shift();
        }
        pendingControlQueue.push({ action, payload: payload ?? {} });
      },

      beginReconnecting: (countdownSeconds: number) => {
        set((state) => ({
          status: 'reconnecting',
          reconnectCountdown: countdownSeconds,
          connectionQuality: 'disconnected',
          reconnectStartedAt: state.reconnectStartedAt ?? Date.now(),
        }));
      },

      tickReconnectCountdown: () => {
        const current = get();
        if (current.reconnectCountdown <= 1) {
          set({ reconnectCountdown: 0 });
        } else {
          set({ reconnectCountdown: current.reconnectCountdown - 1 });
        }
      },

      markSessionExpired: () => {
        invalidateConnectionAttempt();
        clearConnectWatchdog();
        pendingControlQueue.length = 0;
        clearPendingControlAcks();
        set({
          status: 'session_expired',
          error: 'Pairing session expired. Please scan a new QR code.',
          pairingCode: null,
          pairToken: null,
          connectionQuality: 'disconnected',
          reconnectStartedAt: null,
        });
        cleanupPeerConnection();
        signalingClient = null;
      },

      disconnect: () => {
        invalidateConnectionAttempt();
        clearConnectWatchdog();
        if (signalingClient) {
          signalingClient.close();
          signalingClient = null;
        }
        cleanupPeerConnection();
        hmacState = null;
        pendingControlQueue.length = 0;
        clearPendingControlAcks();
        set({
          status: 'disconnected',
          pairingCode: null,
          pairToken: null,
          desktopName: null,
          desktopMetadata: null,
          error: null,
          sessionExpiresAt: null,
          lastHeartbeatAt: null,
          lastHeartbeatLatencyMs: null,
          missedHeartbeats: 0,
          reconnectCountdown: 0,
          connectionQuality: 'disconnected',
          reconnectStartedAt: null,
        });
        useAgentStore.getState().setAgents([]);
        useDispatchTaskStore.getState().reset();
      },

      sendControl: async (action: string, payload?: unknown): Promise<boolean> => {
        if (!isDispatchCompanionEnabled()) return false;

        const { status } = get();
        const controlMessage = buildRelayControlMessage(action, payload);

        if (status === 'reconnecting' || status === 'stale') {
          get().queueControl(action, payload);
          return true;
        }

        if (status === 'disconnected' || status === 'error' || status === 'session_expired') {
          return false;
        }

        if (!hmacState) {
          console.warn('[dispatch] Refusing to send unsigned control message');
          return false;
        }

        const attemptId = connectionAttemptId;
        const sessionHmacState = hmacState;
        const sessionDataChannel = dataChannel;
        const sessionSignalingClient = signalingClient;

        const sendRaw = (envelope: unknown): boolean => {
          if (
            !isCurrentConnectionAttempt(attemptId) ||
            hmacState !== sessionHmacState ||
            get().status !== 'connected'
          ) {
            return false;
          }
          const serialised = JSON.stringify(envelope);
          if (
            sessionDataChannel &&
            dataChannel === sessionDataChannel &&
            sessionDataChannel.readyState === 'open'
          ) {
            try {
              sessionDataChannel.send(serialised);
              return true;
            } catch {
              // Fall through to signaling relay
            }
          }
          if (sessionSignalingClient && signalingClient === sessionSignalingClient) {
            const relay =
              isSignedEnvelopeLike(envelope) || isObject(envelope)
                ? { ...controlMessage.relay, data: envelope as Record<string, unknown> }
                : controlMessage.relay;
            return sessionSignalingClient.sendSignal('control', relay);
          }
          return false;
        };

        try {
          const envelope = await signMessage(
            sessionHmacState,
            controlMessage.relay.action,
            controlMessage.innerPayload,
          );
          const sent = sendRaw(envelope);
          if (sent) controlAckTracker.track(action, payload);
          return sent;
        } catch (err) {
          console.warn('[dispatch] Failed to sign control message:', err);
          return false;
        }
      },

      clearError: () => {
        set({ error: null });
        if (get().status === 'error') {
          set({ status: 'disconnected' });
        }
      },
    }),
    {
      name: 'connection-store',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[connectionStore] Hydration failed:', error);
      },
      partialize: (state) => ({
        desktopName: state.desktopName,
      }),
    },
  ),
);

rehydrateWhenMmkvReady(useConnectionStore, 'connection-store');

function friendlyErrorMessage(raw: string): string {
  switch (raw) {
    case 'connection_error':
      return 'Unable to reach the pairing server. Check your connection.';
    case 'connection_closed':
      return 'Connection to pairing server lost.';
    case 'invalid_code':
      return 'Invalid pairing code. Please try again.';
    case 'session_full':
      return 'This pairing session already has two devices connected.';
    case 'rate_limited':
      return 'Too many attempts. Please wait a moment.';
    default:
      return raw || 'An unexpected error occurred.';
  }
}
