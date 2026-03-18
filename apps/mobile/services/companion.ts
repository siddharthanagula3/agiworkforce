/**
 * Desktop Companion Service
 *
 * Helper utilities for the companion feature including:
 * - QR pairing code validation
 * - Control message builders for approve/reject/polling
 * - Connection health monitoring
 */

import { useConnectionStore } from '@/stores/connectionStore';
import type { RiskLevel } from '@/types/chat';

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

/** Health check interval handle */
let healthCheckInterval: ReturnType<typeof setInterval> | undefined;

/**
 * Start periodic health checks (every 30s).
 * Sends a ping and requests agent refresh.
 */
export function startHealthChecks(): void {
  stopHealthChecks();
  healthCheckInterval = setInterval(() => {
    const { status } = useConnectionStore.getState();
    if (status === 'connected') {
      sendHeartbeatPing();
    }
  }, 30_000);
}

/**
 * Stop periodic health checks.
 */
export function stopHealthChecks(): void {
  if (healthCheckInterval !== undefined) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = undefined;
  }
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
