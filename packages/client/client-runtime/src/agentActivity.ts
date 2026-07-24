import type {
  AgentEventApprovalDecision,
  AgentEventApprovalRiskLevel,
  AgentEventEnvelope,
  AgentEventSource,
  AgentEventStopReason,
  AgentEventToolCategory,
  AgentTaskState,
} from '@agiworkforce/types';

export type AgentActivityRunStatus =
  | 'running'
  | 'paused'
  | 'awaiting-approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentActivityStepStatus =
  | 'pending'
  | 'running'
  | 'awaiting-approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AgentActivityApproval {
  id: string;
  decision?: AgentEventApprovalDecision;
  riskLevel?: AgentEventApprovalRiskLevel;
}

export interface AgentActivityProgressEntry {
  kind: 'progress';
  id: string;
  progressId: string;
  summary: string;
  detail?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAtMs: number;
  completedAtMs?: number;
}

export interface AgentActivityToolEntry {
  kind: 'tool';
  id: string;
  toolCallId: string;
  name: string;
  category: AgentEventToolCategory;
  summary: string;
  status: AgentActivityStepStatus;
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAtMs: number;
  completedAtMs?: number;
  elapsedMs?: number;
  approval?: AgentActivityApproval;
  query?: string;
  sources?: AgentEventSource[];
}

export interface AgentActivitySourcesEntry {
  kind: 'sources';
  id: string;
  toolCallId?: string;
  query?: string;
  sources: AgentEventSource[];
  emittedAtMs: number;
}

export interface AgentActivityArtifactEntry {
  kind: 'artifact';
  id: string;
  artifactId: string;
  name: string;
  mimeType: string;
  uri: string;
  sizeBytes?: number;
  emittedAtMs: number;
}

export interface AgentActivityContextEntry {
  kind: 'context';
  id: string;
  summary: string;
  beforeTokens?: number;
  afterTokens?: number;
  emittedAtMs: number;
}

export interface AgentActivityErrorEntry {
  kind: 'error';
  id: string;
  message: string;
  code?: string;
  retryable?: boolean;
  retryAfterSeconds?: number;
  emittedAtMs: number;
}

export type AgentActivityEntry =
  | AgentActivityProgressEntry
  | AgentActivityToolEntry
  | AgentActivitySourcesEntry
  | AgentActivityArtifactEntry
  | AgentActivityContextEntry
  | AgentActivityErrorEntry;

/**
 * Durable, renderer-neutral projection of the canonical activity envelope.
 *
 * The projection intentionally excludes text and reasoning deltas. Answer text
 * belongs in the assistant message and private provider scratchpads must never
 * be promoted into a user-visible activity log. Only `progress-update`, whose
 * wire contract explicitly guarantees safe display text, becomes a progress
 * row.
 */
export interface AgentActivityState {
  schemaVersion: 1;
  sessionId: string;
  turnId: string;
  lastSequence: number;
  status: AgentActivityRunStatus;
  startedAtMs: number;
  updatedAtMs: number;
  completedAtMs?: number;
  stopReason?: AgentEventStopReason;
  taskId?: string;
  taskState?: AgentTaskState;
  entries: AgentActivityEntry[];
}

export interface FinishAgentActivityLocallyOptions {
  status: Extract<AgentActivityRunStatus, 'completed' | 'failed' | 'cancelled'>;
  completedAtMs: number;
  /** Safe, user-visible transport failure summary. Never pass provider scratchpad text. */
  error?: string;
  /**
   * A host-side protocol validator may discover that a nominal server success
   * is unusable (for example, an end-turn with no text, tool output, source,
   * or artifact). In that narrow case the durable projection may replace a
   * terminal `completed` status with `failed`.
   */
  overrideTerminal?: boolean;
}

export interface StartAgentActivityLocallyOptions {
  sessionId: string;
  turnId: string;
  summary: string;
  startedAtMs: number;
}

const LOCAL_START_PROGRESS_ID = 'progress:local-starting';

/**
 * Give a work-mode turn an honest action state before the provider emits its
 * first canonical envelope. The first server-owned event replaces this local
 * placeholder, so it can never become a duplicate durable step.
 */
export function startAgentActivityLocally(
  options: StartAgentActivityLocallyOptions,
): AgentActivityState {
  return {
    schemaVersion: 1,
    sessionId: options.sessionId,
    turnId: options.turnId,
    lastSequence: -1,
    status: 'running',
    startedAtMs: options.startedAtMs,
    updatedAtMs: options.startedAtMs,
    entries: [
      {
        kind: 'progress',
        id: LOCAL_START_PROGRESS_ID,
        progressId: 'local-starting',
        summary: options.summary,
        status: 'running',
        startedAtMs: options.startedAtMs,
      },
    ],
  };
}

function createState(envelope: AgentEventEnvelope): AgentActivityState {
  return {
    schemaVersion: 1,
    sessionId: envelope.sessionId,
    turnId: envelope.turnId,
    lastSequence: -1,
    status: 'running',
    startedAtMs: envelope.emittedAtMs,
    updatedAtMs: envelope.emittedAtMs,
    entries: [],
  };
}

function stringifyError(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value == null) return undefined;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function stopStatus(reason: AgentEventStopReason): AgentActivityRunStatus {
  if (reason === 'error') return 'failed';
  if (reason === 'cancelled') return 'cancelled';
  if (reason === 'tool-use') return 'running';
  return 'completed';
}

function updateAt<T extends AgentActivityEntry>(
  entries: AgentActivityEntry[],
  index: number,
  update: (entry: T) => T,
): AgentActivityEntry[] {
  const next = entries.slice();
  next[index] = update(entries[index] as T);
  return next;
}

/**
 * Apply one already runtime-validated envelope to the durable activity view.
 * Duplicate or reordered envelopes are ignored by identity, so transport
 * retries cannot duplicate user-visible work.
 */
export function applyAgentActivityEvent(
  current: AgentActivityState | undefined,
  envelope: AgentEventEnvelope,
): AgentActivityState {
  const sameTurn =
    current !== undefined &&
    current.sessionId === envelope.sessionId &&
    current.turnId === envelope.turnId;
  const hasLocalStart =
    sameTurn &&
    current?.lastSequence === -1 &&
    current.entries.some((entry) => entry.id === LOCAL_START_PROGRESS_ID);
  const previous = sameTurn && current && !hasLocalStart ? current : createState(envelope);

  if (sameTurn && envelope.sequence <= previous.lastSequence) return previous;

  let next: AgentActivityState = {
    ...previous,
    lastSequence: envelope.sequence,
    updatedAtMs: envelope.emittedAtMs,
    entries: previous.entries,
  };
  const event = envelope.event;

  switch (event.type) {
    case 'lifecycle':
      if (event.phase === 'started') {
        next = { ...next, status: 'running', startedAtMs: envelope.emittedAtMs };
      } else if (event.phase === 'paused') {
        next = { ...next, status: 'paused' };
      } else if (event.phase === 'resumed') {
        next = { ...next, status: 'running' };
      }
      return next;

    case 'progress-update': {
      const id = `progress:${event.progressId}`;
      const index = next.entries.findIndex((entry) => entry.id === id);
      if (index >= 0) {
        next.entries = updateAt<AgentActivityProgressEntry>(next.entries, index, (entry) => ({
          ...entry,
          summary: event.summary,
          ...(event.detail !== undefined ? { detail: event.detail } : {}),
          status: event.status,
          ...(event.status !== 'running' ? { completedAtMs: envelope.emittedAtMs } : {}),
        }));
      } else {
        next.entries = [
          ...next.entries,
          {
            kind: 'progress',
            id,
            progressId: event.progressId,
            summary: event.summary,
            ...(event.detail !== undefined ? { detail: event.detail } : {}),
            status: event.status,
            startedAtMs: envelope.emittedAtMs,
            ...(event.status !== 'running' ? { completedAtMs: envelope.emittedAtMs } : {}),
          },
        ];
      }
      return next;
    }

    case 'tool-execution-start': {
      const id = `tool:${event.toolCallId}`;
      const toolIndex = next.entries.findIndex((entry) => entry.id === id);
      const detachedSourcesIndex = next.entries.findIndex(
        (entry) => entry.kind === 'sources' && entry.toolCallId === event.toolCallId,
      );
      const detachedSources =
        detachedSourcesIndex >= 0
          ? (next.entries[detachedSourcesIndex] as AgentActivitySourcesEntry)
          : undefined;
      const withoutDetached = detachedSources
        ? next.entries.filter((_, index) => index !== detachedSourcesIndex)
        : next.entries;

      if (toolIndex >= 0 && !detachedSources) {
        next.entries = updateAt<AgentActivityToolEntry>(next.entries, toolIndex, (entry) => ({
          ...entry,
          name: event.name,
          category: event.category,
          summary: event.summary,
          input: event.input,
          status: 'running',
        }));
      } else {
        const existing = withoutDetached.find((entry) => entry.id === id);
        const tool: AgentActivityToolEntry = {
          kind: 'tool',
          id,
          toolCallId: event.toolCallId,
          name: event.name,
          category: event.category,
          summary: event.summary,
          status: 'running',
          input: event.input,
          startedAtMs: existing?.kind === 'tool' ? existing.startedAtMs : envelope.emittedAtMs,
          ...(detachedSources?.query ? { query: detachedSources.query } : {}),
          ...(detachedSources?.sources ? { sources: detachedSources.sources } : {}),
        };
        next.entries = existing
          ? withoutDetached.map((entry) => (entry.id === id ? tool : entry))
          : [...withoutDetached, tool];
      }
      return next;
    }

    case 'tool-execution-end': {
      const id = `tool:${event.toolCallId}`;
      const index = next.entries.findIndex((entry) => entry.id === id);
      if (index >= 0) {
        next.entries = updateAt<AgentActivityToolEntry>(next.entries, index, (entry) => ({
          ...entry,
          name: event.name,
          output: event.output,
          status: event.isError ? 'failed' : 'completed',
          ...(event.isError
            ? { error: stringifyError(event.output) ?? 'Tool execution failed' }
            : {}),
          elapsedMs: event.elapsedMs ?? Math.max(0, envelope.emittedAtMs - entry.startedAtMs),
          completedAtMs: envelope.emittedAtMs,
        }));
      } else {
        next.entries = [
          ...next.entries,
          {
            kind: 'tool',
            id,
            toolCallId: event.toolCallId,
            name: event.name,
            category: 'other',
            summary: event.name,
            status: event.isError ? 'failed' : 'completed',
            output: event.output,
            ...(event.isError
              ? { error: stringifyError(event.output) ?? 'Tool execution failed' }
              : {}),
            startedAtMs: envelope.emittedAtMs,
            completedAtMs: envelope.emittedAtMs,
            ...(event.elapsedMs !== undefined ? { elapsedMs: event.elapsedMs } : {}),
          },
        ];
      }
      return next;
    }

    case 'source-list': {
      const toolId = event.toolCallId ? `tool:${event.toolCallId}` : undefined;
      const toolIndex = toolId ? next.entries.findIndex((entry) => entry.id === toolId) : -1;
      if (toolIndex >= 0) {
        next.entries = updateAt<AgentActivityToolEntry>(next.entries, toolIndex, (entry) => ({
          ...entry,
          ...(event.query !== undefined ? { query: event.query } : {}),
          sources: event.sources,
        }));
      } else {
        const id = `sources:${event.toolCallId ?? envelope.sequence}`;
        const sourceEntry: AgentActivitySourcesEntry = {
          kind: 'sources',
          id,
          ...(event.toolCallId !== undefined ? { toolCallId: event.toolCallId } : {}),
          ...(event.query !== undefined ? { query: event.query } : {}),
          sources: event.sources,
          emittedAtMs: envelope.emittedAtMs,
        };
        const index = next.entries.findIndex((entry) => entry.id === id);
        next.entries =
          index >= 0
            ? updateAt<AgentActivitySourcesEntry>(next.entries, index, () => sourceEntry)
            : [...next.entries, sourceEntry];
      }
      return next;
    }

    case 'approval-requested': {
      const id = `tool:${event.toolCallId}`;
      const index = next.entries.findIndex((entry) => entry.id === id);
      const approval: AgentActivityApproval = {
        id: event.approvalId,
        ...(event.riskLevel !== undefined ? { riskLevel: event.riskLevel } : {}),
      };
      if (index >= 0) {
        next.entries = updateAt<AgentActivityToolEntry>(next.entries, index, (entry) => ({
          ...entry,
          approval,
          status: 'awaiting-approval',
        }));
      } else {
        next.entries = [
          ...next.entries,
          {
            kind: 'tool',
            id,
            toolCallId: event.toolCallId,
            name: event.name,
            category: event.category,
            summary: event.summary,
            input: event.input,
            status: 'awaiting-approval',
            approval,
            startedAtMs: envelope.emittedAtMs,
          },
        ];
      }
      next.status = 'awaiting-approval';
      return next;
    }

    case 'approval-resolved': {
      const index = next.entries.findIndex(
        (entry) => entry.kind === 'tool' && entry.approval?.id === event.approvalId,
      );
      if (index >= 0) {
        next.entries = updateAt<AgentActivityToolEntry>(next.entries, index, (entry) => ({
          ...entry,
          approval: { ...entry.approval!, decision: event.decision },
          status:
            event.decision === 'approved' || event.decision === 'approved-for-session'
              ? 'running'
              : event.decision === 'cancelled'
                ? 'cancelled'
                : 'failed',
          ...(event.decision === 'denied' ? { error: 'Tool use denied' } : {}),
        }));
      }
      next.status =
        event.decision === 'approved' || event.decision === 'approved-for-session'
          ? 'running'
          : event.decision === 'cancelled'
            ? 'cancelled'
            : 'running';
      return next;
    }

    case 'artifact-produced': {
      const id = `artifact:${event.artifactId}`;
      const entry: AgentActivityArtifactEntry = {
        kind: 'artifact',
        id,
        artifactId: event.artifactId,
        name: event.name,
        mimeType: event.mimeType,
        uri: event.uri,
        ...(event.sizeBytes !== undefined ? { sizeBytes: event.sizeBytes } : {}),
        emittedAtMs: envelope.emittedAtMs,
      };
      const index = next.entries.findIndex((candidate) => candidate.id === id);
      next.entries =
        index >= 0
          ? updateAt<AgentActivityArtifactEntry>(next.entries, index, () => entry)
          : [...next.entries, entry];
      return next;
    }

    case 'context-compacted':
      next.entries = [
        ...next.entries,
        {
          kind: 'context',
          id: `context:${envelope.sequence}`,
          summary: event.summary?.trim() || 'Context automatically compacted',
          ...(event.beforeTokens !== undefined ? { beforeTokens: event.beforeTokens } : {}),
          ...(event.afterTokens !== undefined ? { afterTokens: event.afterTokens } : {}),
          emittedAtMs: envelope.emittedAtMs,
        },
      ];
      return next;

    case 'task-state-changed':
      next.taskId = event.taskId;
      next.taskState = event.state;
      if (event.state === 'awaiting_input') {
        next.status = 'awaiting-approval';
      } else if (event.state === 'paused') {
        next.status = 'paused';
      } else if (event.state === 'failed') {
        next.status = 'failed';
        next.completedAtMs = envelope.emittedAtMs;
      } else if (event.state === 'cancelled' || event.state === 'archived') {
        next.status = 'cancelled';
        next.completedAtMs = envelope.emittedAtMs;
      } else if (event.state === 'ready_for_review' || event.state === 'completed') {
        next.status = 'completed';
        next.completedAtMs = envelope.emittedAtMs;
      } else {
        next.status = 'running';
        delete next.completedAtMs;
      }
      return next;

    case 'error':
      next.entries = [
        ...next.entries,
        {
          kind: 'error',
          id: `error:${envelope.sequence}`,
          message: event.message,
          ...(event.code !== undefined ? { code: event.code } : {}),
          ...(event.retryable !== undefined ? { retryable: event.retryable } : {}),
          ...(event.retryAfterSeconds !== undefined
            ? { retryAfterSeconds: event.retryAfterSeconds }
            : {}),
          emittedAtMs: envelope.emittedAtMs,
        },
      ];
      next.status = 'failed';
      next.completedAtMs = envelope.emittedAtMs;
      return next;

    case 'stop': {
      const status = stopStatus(event.reason);
      next.status = status;
      next.stopReason = event.reason;
      if (status !== 'running') next.completedAtMs = envelope.emittedAtMs;
      return next;
    }

    case 'text-delta':
    case 'reasoning-delta':
    case 'tool-use-start':
    case 'tool-use-delta':
    case 'tool-use-end':
    case 'server-tool-use':
    case 'server-tool-result':
    case 'usage':
      return next;
  }
}

/**
 * Close a projection when the local transport ends before the server can emit
 * its terminal envelope (for example, a user abort or a disconnected stream).
 * This does not advance the server-owned sequence number, so a later resume
 * can continue applying canonical envelopes without a synthetic ordering gap.
 */
export function finishAgentActivityLocally(
  current: AgentActivityState,
  options: FinishAgentActivityLocallyOptions,
): AgentActivityState {
  if (
    !options.overrideTerminal &&
    (current.status === 'completed' ||
      current.status === 'failed' ||
      current.status === 'cancelled')
  ) {
    return current;
  }

  const entryStatus = options.status;
  let entries = current.entries.map((entry): AgentActivityEntry => {
    if (entry.kind === 'progress' && entry.status === 'running') {
      return { ...entry, status: entryStatus, completedAtMs: options.completedAtMs };
    }
    if (
      entry.kind === 'tool' &&
      (entry.status === 'pending' ||
        entry.status === 'running' ||
        entry.status === 'awaiting-approval')
    ) {
      return {
        ...entry,
        status: entryStatus,
        completedAtMs: options.completedAtMs,
        elapsedMs: Math.max(0, options.completedAtMs - entry.startedAtMs),
        ...(options.status === 'failed' && options.error ? { error: options.error } : {}),
      };
    }
    return entry;
  });

  const error = options.error?.trim();
  if (
    options.status === 'failed' &&
    error &&
    !entries.some((entry) => entry.kind === 'error' && entry.message === error)
  ) {
    entries = [
      ...entries,
      {
        kind: 'error',
        id: `error:local:${options.completedAtMs}`,
        message: error,
        emittedAtMs: options.completedAtMs,
      },
    ];
  }

  return {
    ...current,
    status: options.status,
    stopReason:
      options.status === 'completed'
        ? 'end-turn'
        : options.status === 'failed'
          ? 'error'
          : 'cancelled',
    updatedAtMs: options.completedAtMs,
    completedAtMs: options.completedAtMs,
    entries,
  };
}
