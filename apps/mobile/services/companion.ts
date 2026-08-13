/**
 * Desktop Companion Service
 *
 * Helper utilities for the companion feature including:
 * - QR pairing code validation
 * - Control message builders for approve/reject/polling
 * - Connection health monitoring with heartbeat/stale detection
 */

import { useConnectionStore } from '@/stores/connectionStore';
import { useDispatchTaskStore } from '@/stores/dispatchTaskStore';
import type { ConnectionQuality } from '@/stores/connectionStore';
import type { RiskLevel } from '@/types/chat';
import type { CompanionApprovalResponse } from '@agiworkforce/types';
import { FEATURES } from '@/lib/v1FeatureFlags';
import * as Crypto from 'expo-crypto';
import { normalizePairingInput } from '@/services/manualPairing';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How long (ms) between heartbeat pings */
const HEARTBEAT_INTERVAL_MS = 30_000;

/** How many missed heartbeats before declaring stale */
const MISSED_HEARTBEAT_STALE_THRESHOLD = 2;

/** Seconds to count down before auto-reconnecting */
const RECONNECT_COUNTDOWN_SECONDS = 15;

/** A new Dispatch task should receive an accepted/rejected status promptly. */
const DISPATCH_ACK_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// QR Code Helpers
// ---------------------------------------------------------------------------

/** Current QR payload: role token included so scanning never needs a claim exchange. */
const PAIRING_CODE_PATTERN = /^agiw:[A-Za-z0-9]{12}:[a-fA-F0-9]{64}$/;

/** Current Desktop display code, with separators removed by normalizePairingInput. */
const RAW_CODE_PATTERN = /^(?:agiw:)?[A-Za-z0-9]{12}$/;

/**
 * Validate a scanned QR string or manually entered code.
 * Returns true if the code is in a valid format.
 */
export function isValidPairingCode(code: string): boolean {
  const normalized = normalizePairingInput(code);
  return PAIRING_CODE_PATTERN.test(normalized) || RAW_CODE_PATTERN.test(normalized);
}

/**
 * Extract the raw code from a QR string (strip `agiw:` prefix and trim whitespace).
 */
export function extractPairingCode(raw: string): string {
  const normalized = normalizePairingInput(raw);
  if (normalized.startsWith('agiw:')) {
    return normalized.slice(5).split(':')[0] ?? '';
  }
  return normalized;
}

// ---------------------------------------------------------------------------
// Control Message Builders
// ---------------------------------------------------------------------------

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

/**
 * Send an approval response back to the desktop.
 * This approves or rejects a pending tool execution.
 */
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

/**
 * Request a full agent status refresh from the desktop.
 * The desktop will respond with an `agents_update` control message.
 */
export function requestAgentRefresh(): void {
  const { sendControl, status } = useConnectionStore.getState();
  if (status !== 'connected') return;

  void sendControl('sync_request', {
    reason: 'agent_refresh',
    requestedAt: new Date().toISOString(),
  });
}

/**
 * Send a command to an agent running on the desktop.
 */
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

/**
 * Send a heartbeat ping to the desktop.
 * Used to verify the control channel is still alive.
 */
export function sendHeartbeatPing(): void {
  const { sendControl, status } = useConnectionStore.getState();
  if (status !== 'connected') return;

  void sendControl('heartbeat', {
    timestamp: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Connection Health
// ---------------------------------------------------------------------------

/** Heartbeat ping interval handle */
let healthCheckInterval: ReturnType<typeof setInterval> | undefined;

/** Stale-detection interval handle — checks if pong stopped arriving */
let staleCheckInterval: ReturnType<typeof setInterval> | undefined;

/** Reconnect countdown tick interval */
let countdownInterval: ReturnType<typeof setInterval> | undefined;

/** Debounce timer for reconnect attempts to prevent rapid connect/disconnect cycles */
let reconnectDebounceTimer: ReturnType<typeof setTimeout> | undefined;

/** Minimum ms between consecutive reconnect attempts */
const RECONNECT_DEBOUNCE_MS = 3_000;

/**
 * Start periodic health checks.
 * - Every 30s: sends a ping (expects `pong` back via control message)
 * - Every 35s: checks lastHeartbeatAt; if stale threshold exceeded, marks state
 * - When reconnecting: ticks countdown and auto-retries when it hits 0
 */
export function startHealthChecks(): void {
  if (!FEATURES.companion) return;
  stopHealthChecks();

  // Heartbeat ping — desktop should respond with pong control message
  healthCheckInterval = setInterval(() => {
    const { status } = useConnectionStore.getState();
    if (status === 'connected' || status === 'stale') {
      sendHeartbeatPing();
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Stale detection — runs slightly after heartbeat to detect missed pongs
  staleCheckInterval = setInterval(() => {
    const store = useConnectionStore.getState();
    if (store.status !== 'connected' && store.status !== 'stale') return;

    const now = Date.now();
    const lastBeat = store.lastHeartbeatAt ?? 0;
    const elapsed = now - lastBeat;

    // If we've missed more than threshold heartbeat windows, mark stale
    if (elapsed > HEARTBEAT_INTERVAL_MS * (MISSED_HEARTBEAT_STALE_THRESHOLD + 0.5)) {
      store.markStale();
      // After additional delay, transition to reconnecting
      if (store.status === 'stale') {
        store.beginReconnecting(RECONNECT_COUNTDOWN_SECONDS);
        startReconnectCountdown();
      }
    }
  }, HEARTBEAT_INTERVAL_MS + 2_000); // Offset 2s after heartbeat ping to catch missed pongs
}

/**
 * Start the reconnect countdown ticker.
 * When it reaches 0, automatically attempts reconnection — with debounce
 * to prevent rapid connect/disconnect cycles.
 */
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
      // Debounce reconnect attempts — guard against rapid cycles
      debouncedReconnect();
    }
  }, 1_000);
}

/**
 * Debounced reconnect: ensures we don't fire multiple connect() calls
 * within RECONNECT_DEBOUNCE_MS even if reconnect countdown fires rapidly.
 */
function debouncedReconnect(): void {
  if (reconnectDebounceTimer !== undefined) {
    // Already scheduled — skip
    return;
  }
  reconnectDebounceTimer = setTimeout(() => {
    reconnectDebounceTimer = undefined;
    const { pairingCode, connect, status } = useConnectionStore.getState();
    // Only attempt if we're still in a reconnecting/stale state
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

/**
 * Stop all periodic health checks and timers.
 */
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

/**
 * Manually trigger a reconnect attempt.
 * Bypasses debounce (user explicitly asked to reconnect).
 * Clears countdown state and reconnects using stored pairing code.
 */
export function manualReconnect(): void {
  // Cancel any pending debounce — user wants immediate reconnect
  if (reconnectDebounceTimer !== undefined) {
    clearTimeout(reconnectDebounceTimer);
    reconnectDebounceTimer = undefined;
  }
  const { pairingCode, connect } = useConnectionStore.getState();
  if (pairingCode) {
    connect(pairingCode);
  }
}

// ---------------------------------------------------------------------------
// Connection Quality
// ---------------------------------------------------------------------------

/**
 * Get a human-readable label and color for connection quality.
 */
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

// Re-export type for consumers
export type { ConnectionQuality };

/**
 * Send emergency stop — cancels ALL running tasks on the desktop.
 */
export function sendEmergencyStop(): void {
  const { sendControl, status } = useConnectionStore.getState();
  if (status !== 'connected' && status !== 'stale') return;

  void sendControl('cancel', {
    scope: 'all',
    sentAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Risk Level Utilities
// ---------------------------------------------------------------------------

/**
 * Get the display color for a risk level.
 * Returns the hex color for badge/indicator rendering.
 */
export function getRiskColor(level: RiskLevel): string {
  switch (level) {
    case 'low':
      return '#10b981'; // emerald
    case 'medium':
      return '#f59e0b'; // amber
    case 'high':
      return '#ef4444'; // red
    default:
      return '#6b7280'; // gray fallback
  }
}

/**
 * Get a badge color name for the Badge component.
 */
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
