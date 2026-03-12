import type { ActionTrailEntry } from '../stores/chat/agentStore';
import type { ActionLogEntry, ActionLogStatus, ActionLogEntryType } from '../stores/chat/toolStore';

export interface RuntimeActivityEmission {
  log: Omit<ActionLogEntry, 'createdAt' | 'updatedAt'>;
  trail?: Omit<ActionTrailEntry, 'id' | 'timestamp'>;
  sidecarEventType?: string;
}

export function buildRuntimeActivityEmission(input: {
  id: string;
  type: ActionLogEntryType;
  title: string;
  status: ActionLogStatus;
  description?: string;
  actionId?: string;
  workflowHash?: string;
  metadata?: Record<string, unknown>;
  result?: string;
  error?: string;
  requiresApproval?: boolean;
  trail?:
    | (Omit<ActionTrailEntry, 'id' | 'timestamp' | 'fadeAfter'> & {
        fadeAfter?: number;
      })
    | null;
  sidecarEventType?: string;
}): RuntimeActivityEmission {
  return {
    log: {
      id: input.id,
      actionId: input.actionId,
      workflowHash: input.workflowHash,
      type: input.type,
      title: input.title,
      description: input.description,
      status: input.status,
      requiresApproval: input.requiresApproval,
      metadata: input.metadata,
      result: input.result,
      error: input.error,
    },
    trail: input.trail
      ? {
          ...input.trail,
          fadeAfter: input.trail.fadeAfter ?? 3500,
        }
      : undefined,
    sidecarEventType: input.sidecarEventType,
  };
}

export function buildToolStreamStartedActivity(input: {
  id: string;
  actionId: string;
  type: ActionLogEntryType;
  toolName: string;
  timestamp: string;
  parameters?: Record<string, unknown> | null;
  sidecarEventType?: string;
}): RuntimeActivityEmission {
  return buildRuntimeActivityEmission({
    id: input.id,
    actionId: input.actionId,
    type: input.type,
    title: `Execute ${input.toolName}`,
    description: `Running ${input.toolName}`,
    status: 'running',
    metadata: {
      tool_name: input.toolName,
      parameters: input.parameters ?? null,
      stream_started_at: input.timestamp,
    },
    trail: {
      type: 'running',
      message: `Executing ${input.toolName}...`,
      metadata: { tool_call_id: input.actionId },
    },
    sidecarEventType: input.sidecarEventType,
  });
}

export function buildToolStreamTerminalActivity(input: {
  id: string;
  actionId: string;
  type: ActionLogEntryType;
  toolName: string;
  status: 'success' | 'failed';
  timestamp: string;
  durationMs: number;
  result?: string;
  error?: string;
  retryable?: boolean;
}): RuntimeActivityEmission {
  const success = input.status === 'success';

  return buildRuntimeActivityEmission({
    id: input.id,
    actionId: input.actionId,
    type: input.type,
    title: `Execute ${input.toolName}`,
    description: success
      ? `Completed in ${input.durationMs}ms`
      : (input.error ?? `Failed after ${input.durationMs}ms`),
    status: input.status,
    result: success ? input.result : undefined,
    error: success ? undefined : input.error,
    metadata: {
      tool_name: input.toolName,
      duration_ms: input.durationMs,
      ...(success ? { stream_completed_at: input.timestamp } : { stream_error_at: input.timestamp }),
      ...(typeof input.retryable === 'boolean' ? { retryable: input.retryable } : {}),
    },
    trail: {
      type: success ? 'completed' : 'error',
      message: success
        ? `${input.toolName} completed (${input.durationMs}ms)`
        : `${input.toolName} failed${input.error ? `: ${input.error}` : ''}`,
      metadata: { tool_call_id: input.actionId },
    },
  });
}

export function buildToolStreamCancelledActivity(input: {
  id: string;
  actionId: string;
  type: ActionLogEntryType;
  toolName: string;
  timestamp: string;
  durationMs: number;
  reason?: string;
}): RuntimeActivityEmission {
  const error = input.reason ?? 'Tool execution cancelled';

  return buildRuntimeActivityEmission({
    id: input.id,
    actionId: input.actionId,
    type: input.type,
    title: `Execute ${input.toolName}`,
    description: error,
    status: 'failed',
    error,
    metadata: {
      tool_name: input.toolName,
      duration_ms: input.durationMs,
      stream_cancelled_at: input.timestamp,
    },
    trail: {
      type: 'error',
      message: `${input.toolName} cancelled${input.reason ? `: ${input.reason}` : ''}`,
      metadata: { tool_call_id: input.actionId },
    },
  });
}
