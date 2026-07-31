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
// MED-MOB-05 fix: per-field Agent payload validator. Lives in its own
// file so it can be unit-tested without pulling in react-native-webrtc.
import { parseAgent, MAX_AGENTS_PER_UPDATE } from '@/lib/dispatchAgentValidator';

/** RTCConfiguration is defined internally in react-native-webrtc but not re-exported. */
interface RTCConfiguration {
  iceServers?: Array<{ urls: string | string[]; username?: string; credential?: string }>;
  iceTransportPolicy?: 'all' | 'relay';
  bundlePolicy?: 'balanced' | 'max-bundle' | 'max-compat';
  rtcpMuxPolicy?: 'require' | 'negotiate';
  iceCandidatePoolSize?: number;
}

/** RTCIceCandidateInit is defined internally in react-native-webrtc but not re-exported. */
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
import type { DispatchTaskLifecycleStatus, DispatchTaskStatusEvent } from '@agiworkforce/types';
import { claimManualPairingToken, normalizePairingInput } from '@/services/manualPairing';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'stale'
  | 'reconnecting'
  | 'session_expired';

/** Qualitative indicator of connection health based on heartbeat latency */
export type ConnectionQuality = 'strong' | 'weak' | 'disconnected';

export interface DesktopMetadata {
  deviceName?: string;
  platform?: string;
  version?: string;
  os?: string;
  [key: string]: unknown;
}

interface ConnectionState {
  /** Current connection status */
  status: ConnectionStatus;
  /** Active pairing code extracted from QR */
  pairingCode: string | null;
  /** Role token required by the signaling server for mobile registration */
  pairToken: string | null;
  /** Desktop device name from peer metadata */
  desktopName: string | null;
  /** Full desktop metadata (version, platform, etc.) */
  desktopMetadata: DesktopMetadata | null;
  /** Human-readable error message when status is 'error' */
  error: string | null;
  /** Session expiry timestamp (ms since epoch) */
  sessionExpiresAt: number | null;
  /** Timestamp of last successful heartbeat pong from desktop (ms) */
  lastHeartbeatAt: number | null;
  /** Latency of the last heartbeat round-trip in ms (null if no pong received) */
  lastHeartbeatLatencyMs: number | null;
  /** How many consecutive heartbeats have been missed */
  missedHeartbeats: number;
  /** Countdown (seconds) until next reconnect attempt when reconnecting */
  reconnectCountdown: number;
  /** Qualitative connection quality derived from heartbeat latency */
  connectionQuality: ConnectionQuality;
  /** Telemetry: total reconnect attempts in this session */
  reconnectAttempts: number;
  /** Telemetry: number of successful reconnects */
  reconnectSuccesses: number;
  /** Telemetry: ms from reconnect start to connected (most recent) */
  lastReconnectDurationMs: number | null;
  /** Timestamp when the current reconnect attempt started (ms) */
  reconnectStartedAt: number | null;

  // --- Actions ---
  connect: (code: string) => void;
  disconnect: () => void;
  sendControl: (action: string, payload?: unknown) => void;
  /** Queue a control message to send once reconnected */
  queueControl: (action: string, payload?: unknown) => void;
  clearError: () => void;
  /** Record a heartbeat pong received from the desktop */
  recordHeartbeat: (latencyMs?: number) => void;
  /** Mark the status as stale after a missed heartbeat */
  markStale: () => void;
  /** Begin reconnecting countdown */
  beginReconnecting: (countdownSeconds: number) => void;
  /** Decrement reconnect countdown by 1 */
  tickReconnectCountdown: () => void;
  /** Mark session as expired */
  markSessionExpired: () => void;
}

/** Signaling client instance — kept outside state to avoid serialization */
let signalingClient: SignalingClient | null = null;

/** Monotonic guard so stale async connect() work cannot mutate a newer session. */
let connectionAttemptId = 0;

function invalidateConnectionAttempt(): void {
  connectionAttemptId += 1;
}

function isCurrentConnectionAttempt(attemptId: number): boolean {
  return attemptId === connectionAttemptId;
}

/**
 * HIGH-MOB-05 fix (2026-05-04, v2 nonce scheme 2026-05-05): per-session
 * HMAC state. Initialised when a pairing code is resolved to a shared secret.
 * Outgoing messages are signed; incoming messages are verified before dispatch.
 * The nonceCache (Map<nonce, receivedAt>) is pruned by verifyMessage() on
 * each inbound message — no separate GC timer needed.
 */
let hmacState: HmacSessionState | null = null;

/** Queue of control messages to flush once reconnected. Capped to prevent unbounded growth. */
const pendingControlQueue: Array<{ action: string; payload: unknown }> = [];
const MAX_PENDING_QUEUE = 200;

/** Drain and send all queued control messages */
function flushPendingControlQueue(): void {
  if (pendingControlQueue.length === 0) return;
  const store = useConnectionStore.getState();
  while (pendingControlQueue.length > 0) {
    const msg = pendingControlQueue.shift();
    if (msg) {
      store.sendControl(msg.action, msg.payload);
    }
  }
}

/** WebRTC peer connection for low-latency data channel */
let peerConnection: RTCPeerConnection | null = null;

/** RTCDataChannel type extracted from createDataChannel return type */
type RTCDataChannelType = ReturnType<RTCPeerConnection['createDataChannel']>;

/** SDP init dict for RTCSessionDescription constructor */
interface RTCSessionDescriptionInit {
  sdp: string;
  type: string;
}

/** WebRTC data channel for control messages */
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

// ---------------------------------------------------------------------------
// Runtime type guards for incoming control messages (no Zod dependency)
// ---------------------------------------------------------------------------

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

/**
 * Handle incoming control messages from the desktop via signaling or data channel.
 * All fields are validated at runtime before use — no unsafe `as` casts.
 *
 * HIGH-MOB-05 fix (v2 nonce scheme 2026-05-05): messages are expected to be
 * signed envelopes { hmac, nonce, payload, ts, type }. When hmacState is
 * initialised the envelope is verified before the inner payload is processed.
 * Messages that fail verification are silently dropped (no error state —
 * avoids providing an oracle to an active attacker).
 *
 * Unsigned messages are rejected. When hmacState is null, control messages are
 * dropped because the receiver cannot authenticate them.
 */
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

/** Synchronous caller for data-channel messages (wraps async handler). */
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
        // MED-MOB-05 fix (red-team 2026-05): per-field validation via
        // parseAgent. Cap to MAX_AGENTS_PER_UPDATE so a malicious relay
        // cannot flood the UI with thousands of fake entries.
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
        // Validate the patch through parseAgent (same per-field length caps and
        // coercion as the agents_update path) by merging it onto the existing
        // agent. Drops updates for unknown agents or patches that fail validation,
        // so a remote peer can't inject oversized/malformed fields via a patch.
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

/**
 * Set up WebRTC peer connection for low-latency data channel communication.
 * Falls back to signaling relay if WebRTC fails.
 */
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

  // Handle ICE candidates — send to peer via signaling
  // react-native-webrtc uses on* callback style
  (pc as unknown as Record<string, unknown>).onicecandidate = (event: {
    candidate: RTCIceCandidate | null;
  }) => {
    if (event.candidate && signalingClient) {
      signalingClient.sendSignal('ice', {
        candidate: event.candidate.toJSON(),
      });
    }
  };

  // Handle incoming data channels from the desktop
  (pc as unknown as Record<string, unknown>).ondatachannel = (event: {
    channel: RTCDataChannelType;
  }) => {
    dataChannel = event.channel;
    if (dataChannel) {
      setupDataChannel(dataChannel);
    }
  };

  // Handle connection state changes
  (pc as unknown as Record<string, unknown>).onconnectionstatechange = () => {
    // Connection state change handled silently — reconnection logic in signaling layer
  };
}

/**
 * Configure data channel event handlers.
 */

function setupDataChannel(channel: RTCDataChannelType): void {
  const ch = channel as unknown as Record<string, unknown>;

  ch.onopen = () => {
    // DataChannel open — low-latency control active
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
    // DataChannel closed
    dataChannel = null;
  };
}

/**
 * Handle WebRTC signaling messages (offer/answer/ice).
 */
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

/**
 * Clean up WebRTC resources.
 */
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

/** Derive connection quality from heartbeat latency and missed heartbeats */
function deriveConnectionQuality(
  latencyMs: number | null,
  missedHeartbeats: number,
  status: ConnectionStatus,
): ConnectionQuality {
  if (status === 'disconnected' || status === 'error' || status === 'session_expired') {
    return 'disconnected';
  }
  if (missedHeartbeats >= 2 || status === 'stale') return 'disconnected';
  if (latencyMs === null) return 'weak'; // connected but no pong yet
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

      connect: (rawCode: string) => {
        if (!isDispatchCompanionEnabled()) {
          invalidateConnectionAttempt();
          get().disconnect();
          return;
        }

        // Clean up any existing connection
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

        // HIGH-MOB-05 fix (v2 nonce scheme 2026-05-05): derive the per-session
        // HMAC key from the pairing code + a random session salt via HKDF-SHA-256.
        // The salt is generated here so it is unique per connect() call (even on
        // reconnect with the same pairing code). The desktop derives the same key
        // when it receives the salt via the `registered` / `peer_ready` event
        // metadata field `dispatchSalt`. The salt is NOT secret — only the derived
        // key is. A fresh nonceCache is allocated for each session so replays from
        // a previous connection cannot be injected into the new session.
        //
        // Audit fix F4 (2026-05-05): replaced Math.random() with CSPRNG
        // (expo-crypto getRandomBytesAsync). Same 16-byte/32 hex-char pattern as
        // lib/mmkv.ts generateMmkvEncryptionKey(). Math.random() had ~36 bits of
        // entropy; this gives 128 bits.
        // MOB-DISPATCH-SALT-RACE (P0) + MOB-DISPATCH-VERSION-HARDCODED (P1):
        // Await salt+HMAC derivation BEFORE constructing SignalingClient so
        // dispatchSalt is never sent as ''. Version read from expo config
        // (same pattern as apps/mobile/app/(app)/about.tsx).
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

          // Set up WebRTC
          setupPeerConnection();

          // Create signaling client (auto-connects on construction)
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
                  // WebSocket opened, waiting for registration confirmation
                  break;

                case 'registered':
                  set({ sessionExpiresAt: event.expiresAt });
                  if (event.peerConnected) {
                    // Desktop is already connected — wait for peer_ready with metadata
                    set({ status: 'connecting' });
                  }
                  break;

                case 'peer_ready': {
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

                  // Flush any queued control messages now that we're reconnected
                  flushPendingControlQueue();
                  // Request a fresh agent state from desktop (don't assume stale state is current)
                  useAgentStore.getState().setAgents([]);
                  break;
                }

                case 'signal':
                  if (event.kind === 'control') {
                    // Control message via signaling relay
                    handleControlMessage(event.payload);
                  } else {
                    // WebRTC signaling (offer/answer/ice)
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
                  // Clear agents when desktop disconnects
                  useAgentStore.getState().setAgents([]);
                  break;

                case 'session_expired':
                  get().markSessionExpired();
                  break;

                case 'terminated':
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
                  set({
                    status: 'error',
                    error: friendlyErrorMessage(event.error),
                  });
                  break;

                case 'close':
                  // Only set disconnected if not already in error state
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
        // If we were stale/reconnecting but got a heartbeat, restore connected
        if (currentStatus === 'stale' || currentStatus === 'reconnecting') {
          set({ status: 'connected' });
          // Flush queued control messages that piled up during disconnect
          flushPendingControlQueue();
          // Re-sync agent state from desktop
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
          pendingControlQueue.shift(); // Drop oldest to stay under cap
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
        // Clear any queued messages — session is gone
        pendingControlQueue.length = 0;
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
        if (signalingClient) {
          signalingClient.close();
          signalingClient = null;
        }
        cleanupPeerConnection();
        // HIGH-MOB-05: clear HMAC session state on disconnect
        hmacState = null;
        // Clear pending queue on intentional disconnect
        pendingControlQueue.length = 0;
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
        // Clear agents on disconnect
        useAgentStore.getState().setAgents([]);
        useDispatchTaskStore.getState().reset();
      },

      sendControl: (action: string, payload?: unknown) => {
        if (!isDispatchCompanionEnabled()) return;

        const { status } = get();
        const controlMessage = buildRelayControlMessage(action, payload);

        // If disconnecting or reconnecting, queue for later delivery instead of dropping
        if (status === 'reconnecting' || status === 'stale') {
          if (pendingControlQueue.length < MAX_PENDING_QUEUE) {
            pendingControlQueue.push({ action, payload: payload ?? {} });
          }
          return;
        }

        // Cannot send when fully disconnected or session expired — silently no-op
        if (status === 'disconnected' || status === 'error' || status === 'session_expired') {
          return;
        }

        // HIGH-MOB-05 fix (v2 nonce scheme 2026-05-05): sign the outgoing
        // control message. Do not send unsigned control data when HMAC state is
        // missing; Dispatch must fail closed.
        if (!hmacState) {
          console.warn('[dispatch] Refusing to send unsigned control message');
          return;
        }

        const sendRaw = (envelope: unknown) => {
          const serialised = JSON.stringify(envelope);
          // Prefer data channel for low latency
          if (dataChannel && dataChannel.readyState === 'open') {
            try {
              dataChannel.send(serialised);
              return;
            } catch {
              // Fall through to signaling relay
            }
          }
          if (signalingClient) {
            const relay =
              isSignedEnvelopeLike(envelope) || isObject(envelope)
                ? { ...controlMessage.relay, data: envelope as Record<string, unknown> }
                : controlMessage.relay;
            signalingClient.sendSignal('control', relay);
          }
        };

        signMessage(hmacState, controlMessage.relay.action, controlMessage.innerPayload)
          .then(sendRaw)
          .catch((err) => {
            console.warn('[dispatch] Failed to sign control message:', err);
          });
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
      // AUDIT-FIX: MMKV-RACE
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[connectionStore] Hydration failed:', error);
      },
      partialize: (state) => ({
        // Do NOT persist pairingCode — it's ephemeral and sensitive
        // Do NOT persist connection status or metadata
        desktopName: state.desktopName,
      }),
    },
  ),
);

rehydrateWhenMmkvReady(useConnectionStore, 'connection-store');

/**
 * Convert raw signaling error strings to user-friendly messages.
 */
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
