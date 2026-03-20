/**
 * Desktop Companion Service
 *
 * Helper utilities for the companion feature including:
 * - QR pairing code validation
 * - Control message builders for approve/reject/polling
 * - Connection health monitoring with heartbeat/stale detection
 */

import { useConnectionStore } from '@/stores/connectionStore';
import type { ConnectionQuality } from '@/stores/connectionStore';
import type { RiskLevel } from '@/types/chat';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How long (ms) between heartbeat pings */
const HEARTBEAT_INTERVAL_MS = 30_000;

/** How many missed heartbeats before declaring stale */
const MISSED_HEARTBEAT_STALE_THRESHOLD = 2;

/** Seconds to count down before auto-reconnecting */
const RECONNECT_COUNTDOWN_SECONDS = 15;

// ---------------------------------------------------------------------------
// QR Code Helpers
// ---------------------------------------------------------------------------

/** Pattern for valid pairing codes: `agiw:` prefix + 6-12 alphanumeric chars */
const PAIRING_CODE_PATTERN = /^agiw:[A-Za-z0-9]{6,12}$/;

/** Pattern for raw codes without prefix */
const RAW_CODE_PATTERN = /^[A-Za-z0-9]{6,12}$/;

/**
 * Validate a scanned QR string or manually entered code.
 * Returns true if the code is in a valid format.
 */
export function isValidPairingCode(code: string): boolean {
  const trimmed = code.trim();
  return PAIRING_CODE_PATTERN.test(trimmed) || RAW_CODE_PATTERN.test(trimmed);
}

/**
 * Extract the raw code from a QR string (strip `agiw:` prefix).
 */
export function extractPairingCode(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('agiw:')) {
    return trimmed.slice(5);
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Control Message Builders
// ---------------------------------------------------------------------------

/**
 * Send an approval response back to the desktop.
 * This approves or rejects a pending tool execution.
 */
export function sendApprovalResponse(requestId: string, approved: boolean): void {
  const { sendControl, status } = useConnectionStore.getState();
  if (status !== 'connected') return;

  sendControl('approval_response', {
    requestId,
    approved,
    respondedAt: new Date().toISOString(),
  });
}

/**
 * Request a full agent status refresh from the desktop.
 * The desktop will respond with an `agents_update` control message.
 */
export function requestAgentRefresh(): void {
  const { sendControl, status } = useConnectionStore.getState();
  if (status !== 'connected') return;

  sendControl('request_agents_refresh');
}

/**
 * Send a command to an agent running on the desktop.
 */
export function sendAgentCommand(agentId: string, command: 'pause' | 'resume' | 'cancel'): void {
  const { sendControl, status } = useConnectionStore.getState();
  if (status !== 'connected') return;

  sendControl('agent_command', {
    agentId,
    command,
    sentAt: new Date().toISOString(),
  });
}

/**
 * Send a heartbeat ping to the desktop.
 * Used to verify the control channel is still alive.
 */
export function sendHeartbeatPing(): void {
  const { sendControl, status } = useConnectionStore.getState();
  if (status !== 'connected') return;

  sendControl('ping', {
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
  }, HEARTBEAT_INTERVAL_MS + 5_000);
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
      connect(pairingCode);
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

  sendControl('emergency_stop', {
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
