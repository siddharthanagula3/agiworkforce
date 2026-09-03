export type AuditSurface = 'desktop' | 'mobile' | 'web' | 'cli' | 'vscode';

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

export interface AuditEvent {
  eventId: string;

  timestamp: string;

  userId: string | null;

  surface: AuditSurface;

  action: AuditAction;

  resource: string;

  outcome: AuditOutcome;

  severity: AuditSeverity;

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
