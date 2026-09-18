import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { recordConnectorCall } from '@/lib/services/infrastructure-cost';
import {
  connectorIdentityName,
  type ConnectorIdentity,
} from '@/features/connectors/lib/connector-outcome';
import {
  CONNECTOR_FAILURE_RECENCY_MS,
  CONNECTOR_FAILURE_STREAK_THRESHOLD,
  readConnectorCallLog,
  recordConnectorCallOutcome,
  type ConnectorCallEntry,
  type ConnectorCallOutcome,
} from '@/lib/services/connector-call-log-service';

export {
  classifyConnectorFailure,
  connectorIdentityName,
  connectorOutcomeNotice,
  describeConnectorFailure,
  CONNECTOR_FAILURE_KINDS,
  type ConnectorFailureKind,
  type ConnectorIdentity,
  type ConnectorOutcomeKind,
  type ConnectorOutcomeNotice,
} from '@/features/connectors/lib/connector-outcome';

/**
 * Everything here derives from the connector call log, the one record of what
 * the provider actually did. Nothing probes a connector on its own, so health,
 * backoff and the outbound limit can never disagree with each other.
 */
export const CONNECTOR_HEALTH_WINDOW_MS = 60 * 60 * 1000;
export const CONNECTOR_BACKOFF_BASE_MS = 2_000;
export const CONNECTOR_BACKOFF_MAX_MS = 5 * 60_000;
export const CONNECTOR_RATE_LIMIT_WINDOW_MS = 60_000;
export const CONNECTOR_RATE_LIMIT_MAX_CALLS = 60;
export const CONNECTOR_DEGRADED_FAILURE_RATIO = 0.25;

const HEALTH_LOG_LIMIT = 100;

export type ConnectorHealthState = 'responding' | 'degraded' | 'not-responding' | 'unknown';
export type ConnectorCircuitState = 'closed' | 'half-open' | 'open';

export interface ConnectorHealthSummary {
  connectorId: string;
  state: ConnectorHealthState;
  calls: number;
  meteredCalls: number;
  failures: number;
  blocked: number;
  failureRatio: number;
  consecutiveFailures: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  lastOutcome: ConnectorCallOutcome | null;
  lastCallAt: string | null;
  circuit: ConnectorCircuitState;
  retryAfterMs: number;
}

function newestFirst(entries: readonly ConnectorCallEntry[]): ConnectorCallEntry[] {
  return [...entries].sort(
    (left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
  );
}

function percentile(sorted: readonly number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? null;
}

export function connectorBackoffDelayMs(consecutiveFailures: number): number {
  if (consecutiveFailures < CONNECTOR_FAILURE_STREAK_THRESHOLD) return 0;
  const steps = consecutiveFailures - CONNECTOR_FAILURE_STREAK_THRESHOLD;
  return Math.min(CONNECTOR_BACKOFF_MAX_MS, CONNECTOR_BACKOFF_BASE_MS * 2 ** steps);
}

/**
 * `blocked` is this platform refusing the arguments, so it never counts against
 * the provider and never opens the circuit on the provider's behalf.
 */
function providerCalls(entries: readonly ConnectorCallEntry[]): ConnectorCallEntry[] {
  return entries.filter((entry) => entry.outcome !== 'blocked');
}

export function summarizeConnectorHealth(
  entries: readonly ConnectorCallEntry[],
  nowMs: number = Date.now(),
): ConnectorHealthSummary[] {
  const byConnector = new Map<string, ConnectorCallEntry[]>();
  for (const entry of entries) {
    const bucket = byConnector.get(entry.connectorId);
    if (bucket) bucket.push(entry);
    else byConnector.set(entry.connectorId, [entry]);
  }
  return [...byConnector.entries()]
    .map(([connectorId, calls]) => summarizeOne(connectorId, calls, nowMs))
    .sort((left, right) => right.calls - left.calls);
}

function summarizeOne(
  connectorId: string,
  calls: readonly ConnectorCallEntry[],
  nowMs: number,
): ConnectorHealthSummary {
  const ordered = newestFirst(calls);
  const metered = providerCalls(ordered);
  const failures = metered.filter((call) => call.outcome === 'failed').length;
  const latencies = metered
    .map((call) => call.durationMs)
    .filter((value): value is number => typeof value === 'number')
    .sort((left, right) => left - right);

  let consecutiveFailures = 0;
  for (const call of metered) {
    if (call.outcome !== 'failed') break;
    consecutiveFailures += 1;
  }

  const newest = ordered[0] ?? null;
  const newestMeteredAt = metered[0] ? Date.parse(metered[0].occurredAt) : null;
  const stale = newestMeteredAt === null || nowMs - newestMeteredAt > CONNECTOR_FAILURE_RECENCY_MS;
  const failureRatio = metered.length === 0 ? 0 : failures / metered.length;

  const circuit = resolveCircuitState(consecutiveFailures, newestMeteredAt, nowMs);
  const state: ConnectorHealthState =
    metered.length === 0
      ? 'unknown'
      : !stale && consecutiveFailures >= CONNECTOR_FAILURE_STREAK_THRESHOLD
        ? 'not-responding'
        : failureRatio > CONNECTOR_DEGRADED_FAILURE_RATIO
          ? 'degraded'
          : 'responding';

  return {
    connectorId,
    state,
    calls: ordered.length,
    meteredCalls: metered.length,
    failures,
    blocked: ordered.length - metered.length,
    failureRatio,
    consecutiveFailures,
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    lastOutcome: newest?.outcome ?? null,
    lastCallAt: newest?.occurredAt ?? null,
    circuit,
    retryAfterMs: circuitRetryAfterMs(consecutiveFailures, newestMeteredAt, nowMs),
  };
}

function circuitRetryAfterMs(
  consecutiveFailures: number,
  newestMeteredAtMs: number | null,
  nowMs: number,
): number {
  const delay = connectorBackoffDelayMs(consecutiveFailures);
  if (delay === 0 || newestMeteredAtMs === null) return 0;
  return Math.max(0, delay - (nowMs - newestMeteredAtMs));
}

function resolveCircuitState(
  consecutiveFailures: number,
  newestMeteredAtMs: number | null,
  nowMs: number,
): ConnectorCircuitState {
  if (consecutiveFailures < CONNECTOR_FAILURE_STREAK_THRESHOLD) return 'closed';
  return circuitRetryAfterMs(consecutiveFailures, newestMeteredAtMs, nowMs) > 0
    ? 'open'
    : 'half-open';
}

export interface ConnectorRateLimitState {
  callsInWindow: number;
  limit: number;
  windowMs: number;
  exceeded: boolean;
  retryAfterMs: number;
}

export function resolveConnectorRateLimit(
  entries: readonly ConnectorCallEntry[],
  nowMs: number = Date.now(),
): ConnectorRateLimitState {
  const window = providerCalls(entries).filter(
    (entry) => nowMs - Date.parse(entry.occurredAt) < CONNECTOR_RATE_LIMIT_WINDOW_MS,
  );
  const oldest = window.reduce<number | null>((earliest, entry) => {
    const at = Date.parse(entry.occurredAt);
    return earliest === null || at < earliest ? at : earliest;
  }, null);
  const exceeded = window.length >= CONNECTOR_RATE_LIMIT_MAX_CALLS;
  return {
    callsInWindow: window.length,
    limit: CONNECTOR_RATE_LIMIT_MAX_CALLS,
    windowMs: CONNECTOR_RATE_LIMIT_WINDOW_MS,
    exceeded,
    retryAfterMs:
      exceeded && oldest !== null
        ? Math.max(0, CONNECTOR_RATE_LIMIT_WINDOW_MS - (nowMs - oldest))
        : 0,
  };
}

export type ConnectorGateReason = 'circuit-open' | 'rate-limited';

export interface ConnectorGateDecision {
  allowed: boolean;
  reason: ConnectorGateReason | null;
  circuit: ConnectorCircuitState;
  retryAfterMs: number;
  message: string | null;
}

function seconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

/**
 * The outbound guard a connector call passes before it leaves: the circuit the
 * failure streak opened, then the per-connector call ceiling. A refusal names
 * the connector, the account and the wait, never a generic error.
 */
export function resolveConnectorGate(
  entries: readonly ConnectorCallEntry[],
  identity: ConnectorIdentity,
  nowMs: number = Date.now(),
): ConnectorGateDecision {
  const own = entries.filter((entry) => entry.connectorId === identity.connectorId);
  const summary = summarizeOne(identity.connectorId, own, nowMs);
  const name = connectorIdentityName(identity);

  if (summary.circuit === 'open') {
    return {
      allowed: false,
      reason: 'circuit-open',
      circuit: summary.circuit,
      retryAfterMs: summary.retryAfterMs,
      message: `${name} failed its last ${summary.consecutiveFailures} calls, so calls to it are paused for ${seconds(summary.retryAfterMs)}s. Nothing was sent.`,
    };
  }

  const rate = resolveConnectorRateLimit(own, nowMs);
  if (rate.exceeded) {
    return {
      allowed: false,
      reason: 'rate-limited',
      circuit: summary.circuit,
      retryAfterMs: rate.retryAfterMs,
      message: `${name} has taken ${rate.callsInWindow} calls in the last minute, which is this account's ceiling of ${rate.limit}. Try again in ${seconds(rate.retryAfterMs)}s. Nothing was sent.`,
    };
  }

  return {
    allowed: true,
    reason: null,
    circuit: summary.circuit,
    retryAfterMs: 0,
    message: null,
  };
}

export interface ConnectorCallMeterRecord {
  userId: string;
  organizationId?: string | null;
  connectorId: string;
  toolName: string;
  outcome: ConnectorCallOutcome;
  durationMs?: number | null;
  surface?: string | null;
}

/**
 * Health and cost for one connector call, written from one place so a metered
 * call is always a logged call. A blocked call never left, so it costs nothing.
 */
export function meterConnectorCall(db: DatabaseAdapter, record: ConnectorCallMeterRecord): void {
  recordConnectorCallOutcome(db, {
    userId: record.userId,
    organizationId: record.organizationId ?? null,
    connectorId: record.connectorId,
    toolName: record.toolName,
    outcome: record.outcome,
    durationMs: record.durationMs ?? null,
    surface: record.surface ?? null,
  });
  if (record.outcome === 'blocked') return;
  recordConnectorCall({
    userId: record.userId,
    organizationId: record.organizationId ?? null,
    connectorId: record.connectorId,
    toolName: record.toolName,
    surface: record.surface ?? null,
  });
}

export async function readConnectorHealth(
  db: DatabaseAdapter,
  userId: string,
  nowMs: number = Date.now(),
): Promise<ConnectorHealthSummary[]> {
  const entries = await readConnectorCallLog(db, userId, { limit: HEALTH_LOG_LIMIT });
  const recent = entries.filter(
    (entry) => nowMs - Date.parse(entry.occurredAt) <= CONNECTOR_HEALTH_WINDOW_MS,
  );
  return summarizeConnectorHealth(recent, nowMs);
}

export async function readConnectorGate(
  db: DatabaseAdapter,
  userId: string,
  identity: ConnectorIdentity,
  nowMs: number = Date.now(),
): Promise<ConnectorGateDecision> {
  const entries = await readConnectorCallLog(db, userId, {
    connectorId: identity.connectorId,
    limit: HEALTH_LOG_LIMIT,
  });
  return resolveConnectorGate(entries, identity, nowMs);
}
