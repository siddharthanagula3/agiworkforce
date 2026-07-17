import type { AgentActivityState } from '@agiworkforce/client-runtime';

const RUN_STATUSES = new Set([
  'running',
  'paused',
  'awaiting-approval',
  'completed',
  'failed',
  'cancelled',
]);
const ENTRY_KINDS = new Set(['progress', 'tool', 'sources', 'artifact', 'context', 'error']);
const PROGRESS_STATUSES = new Set(['running', 'completed', 'failed', 'cancelled']);
const STEP_STATUSES = new Set([
  'pending',
  'running',
  'awaiting-approval',
  'completed',
  'failed',
  'cancelled',
]);
const TOOL_CATEGORIES = new Set([
  'web-search',
  'web-fetch',
  'code-execution',
  'filesystem',
  'shell',
  'skill',
  'memory',
  'connector',
  'mcp',
  'computer-use',
  'artifact',
  'other',
]);
const STOP_REASONS = new Set([
  'end-turn',
  'max-tokens',
  'tool-use',
  'stop-sequence',
  'refusal',
  'cancelled',
  'error',
]);
const APPROVAL_DECISIONS = new Set(['approved', 'approved-for-session', 'denied', 'cancelled']);
const APPROVAL_RISK_LEVELS = new Set(['low', 'medium', 'high']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isSource(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.url === 'string' &&
    typeof value.title === 'string' &&
    (value.snippet === undefined || typeof value.snippet === 'string')
  );
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || isFiniteNumber(value);
}

function isApproval(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (value.decision === undefined ||
      (typeof value.decision === 'string' && APPROVAL_DECISIONS.has(value.decision))) &&
    (value.riskLevel === undefined ||
      (typeof value.riskLevel === 'string' && APPROVAL_RISK_LEVELS.has(value.riskLevel)))
  );
}

function isEntry(value: unknown): boolean {
  if (!isRecord(value) || typeof value.id !== 'string' || !ENTRY_KINDS.has(String(value.kind))) {
    return false;
  }
  switch (value.kind) {
    case 'progress':
      return (
        typeof value.progressId === 'string' &&
        typeof value.summary === 'string' &&
        typeof value.status === 'string' &&
        PROGRESS_STATUSES.has(value.status) &&
        isOptionalString(value.detail) &&
        isFiniteNumber(value.startedAtMs) &&
        isOptionalFiniteNumber(value.completedAtMs)
      );
    case 'tool':
      return (
        typeof value.toolCallId === 'string' &&
        typeof value.name === 'string' &&
        typeof value.category === 'string' &&
        TOOL_CATEGORIES.has(value.category) &&
        typeof value.summary === 'string' &&
        typeof value.status === 'string' &&
        STEP_STATUSES.has(value.status) &&
        isFiniteNumber(value.startedAtMs) &&
        isOptionalFiniteNumber(value.completedAtMs) &&
        isOptionalFiniteNumber(value.elapsedMs) &&
        isOptionalString(value.error) &&
        isOptionalString(value.query) &&
        (value.approval === undefined || isApproval(value.approval)) &&
        (value.sources === undefined ||
          (Array.isArray(value.sources) && value.sources.every(isSource)))
      );
    case 'sources':
      return (
        isOptionalString(value.toolCallId) &&
        isOptionalString(value.query) &&
        Array.isArray(value.sources) &&
        value.sources.every(isSource) &&
        isFiniteNumber(value.emittedAtMs)
      );
    case 'artifact':
      return (
        typeof value.artifactId === 'string' &&
        typeof value.name === 'string' &&
        typeof value.mimeType === 'string' &&
        typeof value.uri === 'string' &&
        isOptionalFiniteNumber(value.sizeBytes) &&
        isFiniteNumber(value.emittedAtMs)
      );
    case 'context':
      return (
        typeof value.summary === 'string' &&
        isOptionalFiniteNumber(value.beforeTokens) &&
        isOptionalFiniteNumber(value.afterTokens) &&
        isFiniteNumber(value.emittedAtMs)
      );
    case 'error':
      return (
        typeof value.message === 'string' &&
        isOptionalString(value.code) &&
        (value.retryable === undefined || typeof value.retryable === 'boolean') &&
        isOptionalFiniteNumber(value.retryAfterSeconds) &&
        isFiniteNumber(value.emittedAtMs)
      );
    default:
      return false;
  }
}

/** Validate synced metadata before it reaches the native renderer or reducer. */
export function readAgentActivityState(value: unknown): AgentActivityState | undefined {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.sessionId !== 'string' ||
    !value.sessionId ||
    typeof value.turnId !== 'string' ||
    !value.turnId ||
    !Number.isInteger(value.lastSequence) ||
    (value.lastSequence as number) < -1 ||
    typeof value.status !== 'string' ||
    !RUN_STATUSES.has(value.status) ||
    !isFiniteNumber(value.startedAtMs) ||
    !isFiniteNumber(value.updatedAtMs) ||
    (value.completedAtMs !== undefined && !isFiniteNumber(value.completedAtMs)) ||
    (value.stopReason !== undefined &&
      (typeof value.stopReason !== 'string' || !STOP_REASONS.has(value.stopReason))) ||
    !Array.isArray(value.entries) ||
    !value.entries.every(isEntry)
  ) {
    return undefined;
  }
  return value as unknown as AgentActivityState;
}
