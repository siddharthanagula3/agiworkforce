
import { useConnectionStore } from '@/stores/connectionStore';
import { useDispatchTaskStore } from '@/stores/dispatchTaskStore';
import type { ConnectionQuality } from '@/stores/connectionStore';
import type { RiskLevel } from '@/types/chat';
import type { CompanionApprovalResponse } from '@agiworkforce/types';
import { FEATURES } from '@/lib/v1FeatureFlags';
import * as Crypto from 'expo-crypto';
import { normalizePairingInput } from '@/services/manualPairing';

const HEARTBEAT_INTERVAL_MS = 30_000;

const MISSED_HEARTBEAT_STALE_THRESHOLD = 2;

const RECONNECT_COUNTDOWN_SECONDS = 15;

const DISPATCH_ACK_TIMEOUT_MS = 15_000;

const PAIRING_CODE_PATTERN = /^agiw:[A-Za-z0-9]{12}:[a-fA-F0-9]{64}$/;

const RAW_CODE_PATTERN = /^(?:agiw:)?[A-Za-z0-9]{12}$/;

export function isValidPairingCode(code: string): boolean {
  const normalized = normalizePairingInput(code);
  return PAIRING_CODE_PATTERN.test(normalized) || RAW_CODE_PATTERN.test(normalized);
}

export function extractPairingCode(raw: string): string {
  const normalized = normalizePairingInput(raw);
  if (normalized.startsWith('agiw:')) {
    return normalized.slice(5).split(':')[0] ?? '';
  }
  return normalized;
}

export type ApprovalResponsePayload = Omit<CompanionApprovalResponse, 'action'>;

export function buildApprovalResponsePayload(
  requestId: string,
  approved: boolean,
  reason?: string,
): ApprovalResponsePayload {
  return {
    version: 1,
    requestId,
    approved,
    respondedAt: new Date().toISOString(),
    ...(reason ? { reason } : {}),
  };
}

export async function sendApprovalResponse(
  requestId: string,
  approved: boolean,
  reason?: string,
): Promise<boolean> {
  const { queueControl, sendControl, status } = useConnectionStore.getState();
  const payload = buildApprovalResponsePayload(requestId, approved, reason);
  if (status === 'connected') {
    return sendControl('approval_response', payload);
  }
  if (status === 'reconnecting' || status === 'stale') {
    queueControl('approval_response', payload);
    return true;
  }
  return false;
}

export function requestAgentRefresh(): void {
  const { sendControl, status } = useConnectionStore.getState();
  if (status !== 'connected') return;

  void sendControl('sync_request', {
    reason: 'agent_refresh',
    requestedAt: new Date().toISOString(),
  });
}

export function sendAgentCommand(agentId: string, command: 'pause' | 'resume' | 'cancel'): void {
  const { sendControl, status } = useConnectionStore.getState();
  if (status !== 'connected') return;

  void sendControl(command === 'cancel' ? 'cancel' : 'dispatch_request', {
    kind: 'agent_command',
    agentId,
    command,
    sentAt: new Date().toISOString(),
  });
}

export interface NewDispatchTaskInput {
  prompt: string;
  title?: string;
}

function createDispatchRequestId(): string | null {
  const globalCrypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
  const globalUuid = globalCrypto?.randomUUID?.();
  if (globalUuid) return globalUuid;

  const expoUuid = Crypto.randomUUID?.();
  return expoUuid || null;
}

export async function sendDispatchTask(input: NewDispatchTaskInput): Promise<string | null> {
  const { sendControl, status } = useConnectionStore.getState();
  const prompt = input.prompt.trim();
  const title = input.title?.trim() || prompt.slice(0, 80);
  if (
    status !== 'connected' ||
    !FEATURES.companion ||
    !FEATURES.dispatch ||
    !prompt ||
    prompt.length > 20_000 ||
    title.length > 160
  ) {
    return null;
  }

  const requestId = createDispatchRequestId();
  if (!requestId) return null;
  const sentAt = new Date().toISOString();
  useDispatchTaskStore.getState().addOutgoingTask({ requestId, prompt, title, sentAt });
  const acceptedByTransport = await sendControl('dispatch.task.create', {
    version: 1,
    requestId,
    prompt,
    title,
    sentAt,
  });
  if (!acceptedByTransport) {
    useDispatchTaskStore
      .getState()
      .markTransportFailure(
        requestId,
        'Could not send this task to Desktop. Check the connection and try again.',
        true,
      );
    return null;
  }
  const acknowledgementTimer = setTimeout(() => {
    useDispatchTaskStore.getState().markAcknowledgementTimeout(requestId);
  }, DISPATCH_ACK_TIMEOUT_MS);
  const timerWithUnref = acknowledgementTimer as ReturnType<typeof setTimeout> & {
    unref?: () => void;
  };
  timerWithUnref.unref?.();
  return requestId;
}

export async function cancelDispatchTask(requestId: string, taskId?: string): Promise<boolean> {
  const { sendControl, status } = useConnectionStore.getState();
  if (status !== 'connected' || !FEATURES.companion || !FEATURES.dispatch) return false;

  const acceptedByTransport = await sendControl('dispatch.task.cancel', {
    version: 1,
    requestId,
    ...(taskId ? { taskId } : {}),
    sentAt: new Date().toISOString(),
  });
  if (!acceptedByTransport) {
    useDispatchTaskStore
      .getState()
      .markTransportFailure(
        requestId,
        'The cancel request could not be sent. The Desktop task may still be running.',
      );
  }
  return acceptedByTransport;
}

export function sendHeartbeatPing(): void {
  const { sendControl, status } = useConnectionStore.getState();
  if (status !== 'connected') return;

  void sendControl('heartbeat', {
    timestamp: Date.now(),
  });
}

let healthCheckInterval: ReturnType<typeof setInterval> | undefined;

let staleCheckInterval: ReturnType<typeof setInterval> | undefined;

let countdownInterval: ReturnType<typeof setInterval> | undefined;

let reconnectDebounceTimer: ReturnType<typeof setTimeout> | undefined;

const RECONNECT_DEBOUNCE_MS = 3_000;

export function startHealthChecks(): void {
  if (!FEATURES.companion) return;
  stopHealthChecks();

  healthCheckInterval = setInterval(() => {
    const { status } = useConnectionStore.getState();
    if (status === 'connected' || status === 'stale') {
      sendHeartbeatPing();
    }
  }, HEARTBEAT_INTERVAL_MS);

  staleCheckInterval = setInterval(() => {
    const store = useConnectionStore.getState();
    if (store.status !== 'connected' && store.status !== 'stale') return;

    const now = Date.now();
    const lastBeat = store.lastHeartbeatAt ?? 0;
    const elapsed = now - lastBeat;

    if (elapsed > HEARTBEAT_INTERVAL_MS * (MISSED_HEARTBEAT_STALE_THRESHOLD + 0.5)) {
      store.markStale();
      if (store.status === 'stale') {
        store.beginReconnecting(RECONNECT_COUNTDOWN_SECONDS);
        startReconnectCountdown();
      }
    }
  }, HEARTBEAT_INTERVAL_MS + 2_000);
}

function startReconnectCountdown(): void {
  if (countdownInterval !== undefined) {
    clearInterval(countdownInterval);
  }
  countdownInterval = setInterval(() => {
    const store = useConnectionStore.getState();
    if (store.status !== 'reconnecting') {
      clearInterval(countdownInterval);
      countdownInterval = undefined;
      return;
    }
    store.tickReconnectCountdown();
    if (store.reconnectCountdown <= 1) {
      clearInterval(countdownInterval);
      countdownInterval = undefined;
      debouncedReconnect();
    }
  }, 1_000);
}

function debouncedReconnect(): void {
  if (reconnectDebounceTimer !== undefined) {
    return;
  }
  reconnectDebounceTimer = setTimeout(() => {
    reconnectDebounceTimer = undefined;
    const { pairingCode, connect, status } = useConnectionStore.getState();
    if (pairingCode && (status === 'reconnecting' || status === 'stale')) {
      try {
        connect(pairingCode);
      } catch (err) {
        console.warn('[Companion] Reconnect failed:', err);
        useConnectionStore.getState().clearError();
      }
    }
  }, RECONNECT_DEBOUNCE_MS);
}

export function stopHealthChecks(): void {
  if (healthCheckInterval !== undefined) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = undefined;
  }
  if (staleCheckInterval !== undefined) {
    clearInterval(staleCheckInterval);
    staleCheckInterval = undefined;
  }
  if (countdownInterval !== undefined) {
    clearInterval(countdownInterval);
    countdownInterval = undefined;
  }
  if (reconnectDebounceTimer !== undefined) {
    clearTimeout(reconnectDebounceTimer);
    reconnectDebounceTimer = undefined;
  }
}

export function manualReconnect(): void {
  if (reconnectDebounceTimer !== undefined) {
    clearTimeout(reconnectDebounceTimer);
    reconnectDebounceTimer = undefined;
  }
  const { pairingCode, connect } = useConnectionStore.getState();
  if (pairingCode) {
    connect(pairingCode);
  }
}

export function getConnectionQualityLabel(quality: ConnectionQuality): {
  label: string;
  color: string;
} {
  switch (quality) {
    case 'strong':
      return { label: 'Strong', color: '#10b981' };
    case 'weak':
      return { label: 'Weak', color: '#f59e0b' };
    case 'disconnected':
      return { label: 'Disconnected', color: '#ef4444' };
  }
}

export type { ConnectionQuality };

export function sendEmergencyStop(): void {
  const { sendControl, status } = useConnectionStore.getState();
  if (status !== 'connected' && status !== 'stale') return;

  void sendControl('cancel', {
    scope: 'all',
    sentAt: new Date().toISOString(),
  });
}

export function getRiskColor(level: RiskLevel): string {
  switch (level) {
    case 'low':
      return '#10b981';
    case 'medium':
      return '#f59e0b';
    case 'high':
      return '#ef4444';
    default:
      return '#6b7280';
  }
}

export function getRiskBadgeColor(level: RiskLevel): 'green' | 'yellow' | 'red' {
  switch (level) {
    case 'low':
      return 'green';
    case 'medium':
      return 'yellow';
    case 'high':
      return 'red';
  }
}
