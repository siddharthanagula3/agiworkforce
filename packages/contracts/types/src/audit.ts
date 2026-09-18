/**
 * Audit Event Schema
 *
 * Platform-wide audit trail types for security, compliance, and observability.
 * Every surface (desktop, mobile, web, CLI, VS Code) can emit audit events
 * using these shared types and helpers.
 *
 * Related contracts:
 *   - `docs/contracts/AUTH_SYNC_ERROR_TAXONOMY.md`, error codes referenced in failure outcomes
 *   - `packages/contracts/types/src/runtime.ts`, runtime activity and approval types (finer-grained)
 *
 * @module audit
 * @packageDocumentation
 */

import type { ConceptName } from './concept-registry';
import type { SourceSurface } from './suite-contracts';

export type { ConceptName };

/**
 * The surfaces are the product's surfaces. A second list here drifted from
 * `SourceSurface` the moment the Chrome extension shipped.
 */
export type AuditSurface = SourceSurface;

export type AuditAction =
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

export type AuditSeverity = 'info' | 'warning' | 'critical';

export type AuditOutcome = 'success' | 'failure' | 'denied';

/**
 * The envelope's own version. A reader that meets a version it does not know
 * must keep the record rather than drop it, so this is read before anything
 * else in the event body.
 */
export const AUDIT_EVENT_SCHEMA_VERSION = 1;

/**
 * How long a record must be kept and what may be done to it before then.
 * `operational` is the only class a retention sweep may shorten; the rest
 * outlive the subject, which is why deleting an organization anonymizes its
 * audit rows instead of removing them.
 */
export const AUDIT_RETENTION_CLASSES = ['operational', 'security', 'compliance'] as const;

export type AuditRetentionClass = (typeof AUDIT_RETENTION_CLASSES)[number];

export interface AuditRetentionRule {
  /** Days the record must survive, counted from `timestamp`. */
  minimumDays: number;
  /** A sweep may delete the row once the minimum has passed. */
  purgeable: boolean;
  /** The subject's deletion anonymizes the row rather than removing it. */
  anonymizeOnSubjectDeletion: boolean;
}

export const AUDIT_RETENTION_RULES: Readonly<Record<AuditRetentionClass, AuditRetentionRule>> =
  Object.freeze({
    operational: { minimumDays: 90, purgeable: true, anonymizeOnSubjectDeletion: true },
    security: { minimumDays: 365, purgeable: false, anonymizeOnSubjectDeletion: true },
    compliance: { minimumDays: 2555, purgeable: false, anonymizeOnSubjectDeletion: true },
  });

export interface AuditEvent {
  /** Which shape this record was written in. */
  schemaVersion: number;

  eventId: string;

  /**
   * The operation the whole chain belongs to, so an event, the request that
   * caused it and the span that carried it can be joined without guessing.
   */
  correlationId?: string;

  /** The event this one is a consequence of, or absent when it starts a chain. */
  causationId?: string;

  /** The attempt that produced it: `<requestId>:<operationId>:<attemptId>`. */
  operationRef?: string;

  timestamp: string;

  userId: string | null;

  surface: AuditSurface;

  action: AuditAction;

  resource: string;

  /**
   * Which domain concept `resource` identifies, drawn from the concept
   * registry. `enterprise_audit_events.resource_type` stores free text today,
   * so a reader cannot group events by object without one vocabulary.
   */
  resourceType?: ConceptName;

  outcome: AuditOutcome;

  severity: AuditSeverity;

  retentionClass: AuditRetentionClass;

  metadata?: Record<string, unknown>;
}

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
 * Security and compliance obligations outlive the operational record of the
 * same subject, so the class follows the action rather than the caller.
 */
export function defaultRetentionClassForAction(action: AuditAction): AuditRetentionClass {
  switch (action) {
    case 'auth_login':
    case 'auth_logout':
    case 'tool_denied':
    case 'tool_timeout':
      return 'security';
    case 'settings_changed':
    case 'data_exported':
    case 'data_deleted':
      return 'compliance';
    default:
      return 'operational';
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
  params: Omit<
    AuditEvent,
    'schemaVersion' | 'eventId' | 'timestamp' | 'severity' | 'retentionClass'
  > & {
    eventId?: string;
    timestamp?: string;
    severity?: AuditSeverity;
    retentionClass?: AuditRetentionClass;
  },
): AuditEvent {
  const event: AuditEvent = {
    schemaVersion: AUDIT_EVENT_SCHEMA_VERSION,
    eventId: params.eventId ?? crypto.randomUUID(),
    timestamp: params.timestamp ?? new Date().toISOString(),
    severity: params.severity ?? defaultSeverityForAction(params.action),
    retentionClass: params.retentionClass ?? defaultRetentionClassForAction(params.action),
    userId: params.userId,
    surface: params.surface,
    action: params.action,
    resource: params.resource,
    outcome: params.outcome,
  };

  if (params.correlationId !== undefined) {
    event.correlationId = params.correlationId;
  }

  if (params.causationId !== undefined) {
    event.causationId = params.causationId;
  }

  if (params.operationRef !== undefined) {
    event.operationRef = params.operationRef;
  }

  if (params.resourceType !== undefined) {
    event.resourceType = params.resourceType;
  }

  if (params.metadata !== undefined) {
    event.metadata = params.metadata;
  }

  return event;
}
