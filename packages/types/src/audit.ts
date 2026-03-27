/**
 * Audit Event Schema
 *
 * Platform-wide audit trail types for security, compliance, and observability.
 * Every surface (desktop, mobile, web, CLI, VS Code) can emit audit events
 * using these shared types and helpers.
 *
 * Related contracts:
 *   - `docs/contracts/AUTH_SYNC_ERROR_TAXONOMY.md` — error codes referenced in failure outcomes
 *   - `packages/types/src/runtime.ts` — runtime activity and approval types (finer-grained)
 *
 * @module audit
 * @packageDocumentation
 */

// ============================================================================
// Surface
// ============================================================================

/** Surface that emitted the audit event. */
export type AuditSurface = 'desktop' | 'mobile' | 'web' | 'cli' | 'vscode';

// ============================================================================
// Actions
// ============================================================================

/** Auditable actions across the platform. */
export type AuditAction =
  // Authentication
  | 'auth_login'
  | 'auth_logout'
  // Tool approval
  | 'tool_approved'
  | 'tool_denied'
  | 'tool_timeout'
  // Agent lifecycle
  | 'agent_started'
  | 'agent_completed'
  | 'agent_failed'
  | 'agent_paused'
  | 'agent_cancelled'
  // Settings
  | 'settings_changed'
  // Data management
  | 'data_exported'
  | 'data_deleted';

// ============================================================================
// Severity
// ============================================================================

/** Severity level of an audit event. */
export type AuditSeverity = 'info' | 'warning' | 'critical';

// ============================================================================
// Outcome
// ============================================================================

/** Outcome of the audited action. */
export type AuditOutcome = 'success' | 'failure' | 'denied';

// ============================================================================
// Audit Event
// ============================================================================

/**
 * A single audit event representing a security- or compliance-relevant action.
 *
 * Events are append-only; once emitted they should not be mutated or deleted.
 */
export interface AuditEvent {
  /** Globally unique event identifier (UUID v4). */
  eventId: string;

  /** ISO 8601 timestamp when the event occurred. */
  timestamp: string;

  /** User ID of the actor (null for system-initiated events). */
  userId: string | null;

  /** Surface that produced the event. */
  surface: AuditSurface;

  /** The action that was performed. */
  action: AuditAction;

  /** The resource acted upon (e.g., tool name, agent session ID, setting key). */
  resource: string;

  /** Outcome of the action. */
  outcome: AuditOutcome;

  /** Severity classification. */
  severity: AuditSeverity;

  /** Free-form metadata for additional context. */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Infer the default severity for an action based on its nature.
 *
 * - Tool denials and agent failures are `warning`.
 * - Data deletion is `critical`.
 * - Everything else is `info`.
 */
export function defaultSeverityForAction(action: AuditAction): AuditSeverity {
  switch (action) {
    case 'tool_denied':
    case 'tool_timeout':
    case 'agent_failed':
      return 'warning';
    case 'data_deleted':
      return 'critical';
    default:
      return 'info';
  }
}

/**
 * Create an `AuditEvent` with sensible defaults.
 *
 * Generates `eventId` and `timestamp` automatically. Sets `severity`
 * from the action unless explicitly provided.
 *
 * @example
 * ```typescript
 * const event = createAuditEvent({
 *   userId: 'usr_abc',
 *   surface: 'desktop',
 *   action: 'tool_approved',
 *   resource: 'mcp__filesystem__write_file',
 *   outcome: 'success',
 * });
 * ```
 */
export function createAuditEvent(
  params: Omit<AuditEvent, 'eventId' | 'timestamp' | 'severity'> & {
    eventId?: string;
    timestamp?: string;
    severity?: AuditSeverity;
  },
): AuditEvent {
  const event: AuditEvent = {
    eventId: params.eventId ?? crypto.randomUUID(),
    timestamp: params.timestamp ?? new Date().toISOString(),
    severity: params.severity ?? defaultSeverityForAction(params.action),
    userId: params.userId,
    surface: params.surface,
    action: params.action,
    resource: params.resource,
    outcome: params.outcome,
  };

  if (params.metadata !== undefined) {
    event.metadata = params.metadata;
  }

  return event;
}
