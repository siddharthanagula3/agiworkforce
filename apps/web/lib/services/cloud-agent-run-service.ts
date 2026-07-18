import 'server-only';

import { randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  AgentEventEnvelopeSchema,
  AgentTaskStateSchema,
  CloudAgentRunSchema,
  type CloudAgentOriginSurface,
  type CloudAgentRun,
  type CloudAgentWorkMode,
} from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope, AgentTaskState } from '@agiworkforce/types/protocol';
import { z } from 'zod';

const TERMINAL_STATES = new Set<AgentTaskState>([
  'ready_for_review',
  'completed',
  'failed',
  'cancelled',
  'archived',
]);

interface CloudAgentRunRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  request_id: string;
  conversation_id: string | null;
  origin_surface: string;
  work_mode: string;
  state: string;
  provider: string;
  model: string;
  last_event_sequence: number | string;
  cancellation_requested_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CloudAgentEventRow extends Record<string, unknown> {
  sequence: number | string;
  envelope: unknown;
  emitted_at: string;
}

const CheckpointThinkingBlockSchema = z.object({
  type: z.literal('thinking'),
  thinking: z.string(),
  signature: z.string().optional(),
});

const CheckpointMessageSchema = z
  .object({
    role: z.enum(['system', 'user', 'assistant', 'tool']),
    content: z.string(),
    tool_calls: z.array(z.unknown()).optional(),
    tool_call_id: z.string().optional(),
    __canonicalThinking: z.array(CheckpointThinkingBlockSchema).optional(),
  })
  .passthrough();

const PendingToolCallSchema = z.object({
  id: z.string().min(1).max(256),
  qualifiedName: z.string().min(1).max(512),
  args: z.record(z.string(), z.unknown()),
});

const CheckpointStateSchema = z.enum(['pending', 'resuming', 'resolved', 'failed']);

interface CloudAgentApprovalCheckpointRow extends Record<string, unknown> {
  id: string;
  run_id: string;
  user_id: string;
  version: number | string;
  session_id: string;
  turn_id: string;
  next_event_sequence: number | string;
  completed_steps: number | string;
  request: unknown;
  messages: unknown;
  pending_tool_calls: unknown;
  state: string;
  lease_token: string | null;
  lease_expires_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CloudAgentApprovalCheckpointState = z.infer<typeof CheckpointStateSchema>;
export type CloudAgentCheckpointMessage = z.infer<typeof CheckpointMessageSchema>;
export type CloudAgentPendingToolCall = z.infer<typeof PendingToolCallSchema>;

export interface CloudAgentApprovalCheckpoint {
  id: string;
  runId: string;
  userId: string;
  version: number;
  sessionId: string;
  turnId: string;
  nextEventSequence: number;
  completedSteps: number;
  request: Record<string, unknown>;
  messages: CloudAgentCheckpointMessage[];
  pendingToolCalls: CloudAgentPendingToolCall[];
  state: CloudAgentApprovalCheckpointState;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CloudAgentApprovalDecision {
  toolCallId: string;
  decision: 'approved' | 'rejected';
}

export interface ClaimedCloudAgentApprovalCheckpoint {
  checkpoint: CloudAgentApprovalCheckpoint;
  approvals: CloudAgentApprovalDecision[];
  leaseToken: string;
}

export interface CloudAgentRunSnapshot {
  run: CloudAgentRun;
  events: AgentEventEnvelope[];
}

export interface CloudAgentRunCursor {
  updatedAt: string;
  id: string;
}

export interface CloudAgentRunList {
  runs: CloudAgentRun[];
  next: CloudAgentRunCursor | null;
}

export class CloudAgentRunNotFoundError extends Error {
  constructor() {
    super('Cloud agent run not found');
    this.name = 'CloudAgentRunNotFoundError';
  }
}

export class CloudAgentApprovalCheckpointNotFoundError extends Error {
  constructor() {
    super('Pending cloud agent approval checkpoint not found');
    this.name = 'CloudAgentApprovalCheckpointNotFoundError';
  }
}

export class CloudAgentApprovalDecisionError extends Error {
  constructor(message = 'Approval decisions do not match the pending tool calls') {
    super(message);
    this.name = 'CloudAgentApprovalDecisionError';
  }
}

export class CloudAgentApprovalCheckpointConflictError extends Error {
  constructor(message = 'Cloud agent approval checkpoint is already being resumed') {
    super(message);
    this.name = 'CloudAgentApprovalCheckpointConflictError';
  }
}

function mapRun(row: CloudAgentRunRow): CloudAgentRun {
  return CloudAgentRunSchema.parse({
    id: row.id,
    userId: row.user_id,
    requestId: row.request_id,
    conversationId: row.conversation_id,
    originSurface: row.origin_surface,
    workMode: row.work_mode,
    state: row.state,
    provider: row.provider,
    model: row.model,
    lastEventSequence: Number(row.last_event_sequence),
    cancellationRequestedAt: row.cancellation_requested_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function requireRun(rows: CloudAgentRunRow[]): CloudAgentRun {
  const row = rows[0];
  if (!row) throw new CloudAgentRunNotFoundError();
  return mapRun(row);
}

function mapApprovalCheckpoint(row: CloudAgentApprovalCheckpointRow): CloudAgentApprovalCheckpoint {
  const request = z.record(z.string(), z.unknown()).parse(row.request);
  return {
    id: z.string().uuid().parse(row.id),
    runId: z.string().uuid().parse(row.run_id),
    userId: z.string().min(1).parse(row.user_id),
    version: z.coerce.number().int().positive().parse(row.version),
    sessionId: z.string().min(1).parse(row.session_id),
    turnId: z.string().min(1).parse(row.turn_id),
    nextEventSequence: z.coerce.number().int().nonnegative().parse(row.next_event_sequence),
    completedSteps: z.coerce.number().int().nonnegative().parse(row.completed_steps),
    request,
    messages: z.array(CheckpointMessageSchema).parse(row.messages),
    pendingToolCalls: z.array(PendingToolCallSchema).min(1).max(32).parse(row.pending_tool_calls),
    state: CheckpointStateSchema.parse(row.state),
    leaseToken: z.string().uuid().nullable().parse(row.lease_token),
    leaseExpiresAt: z.string().datetime().nullable().parse(row.lease_expires_at),
    resolvedAt: z.string().datetime().nullable().parse(row.resolved_at),
    createdAt: z.string().datetime().parse(row.created_at),
    updatedAt: z.string().datetime().parse(row.updated_at),
  };
}

function requireApprovalCheckpoint(
  rows: CloudAgentApprovalCheckpointRow[],
  error: Error = new CloudAgentApprovalCheckpointNotFoundError(),
): CloudAgentApprovalCheckpoint {
  const row = rows[0];
  if (!row) throw error;
  return mapApprovalCheckpoint(row);
}

export async function createCloudAgentRun(
  db: DatabaseAdapter,
  input: {
    userId: string;
    requestId: string;
    conversationId?: string;
    originSurface: CloudAgentOriginSurface;
    workMode: CloudAgentWorkMode;
    provider: string;
    model: string;
  },
): Promise<CloudAgentRun> {
  const rows = await db.query<CloudAgentRunRow>(
    `with inserted as (
       insert into public.cloud_agent_runs (
         user_id, request_id, conversation_id, origin_surface, work_mode, state, provider, model
       ) values ($1, $2, $3, $4, $5, 'running', $6, $7)
       on conflict (user_id, request_id) do nothing
       returning *
     )
     select * from inserted
     union all
     select * from public.cloud_agent_runs
      where user_id = $1 and request_id = $2 and not exists (select 1 from inserted)
     limit 1`,
    [
      input.userId,
      input.requestId,
      input.conversationId ?? null,
      input.originSurface,
      input.workMode,
      input.provider,
      input.model,
    ],
  );
  return requireRun(rows);
}

export async function appendCloudAgentEvent(
  db: DatabaseAdapter,
  input: { userId: string; runId: string; envelope: AgentEventEnvelope },
): Promise<CloudAgentRun> {
  const envelope = AgentEventEnvelopeSchema.parse(input.envelope);

  return db.transaction((tx) =>
    appendCloudAgentEventWithinTransaction(tx, {
      userId: input.userId,
      runId: input.runId,
      envelope,
    }),
  );
}

async function appendCloudAgentEventWithinTransaction(
  tx: DatabaseAdapter,
  input: { userId: string; runId: string; envelope: AgentEventEnvelope },
): Promise<CloudAgentRun> {
  const envelope = input.envelope;
  const nextState = envelope.event.type === 'task-state-changed' ? envelope.event.state : undefined;

  const inserted = await tx.query<{ sequence: number }>(
    `insert into public.cloud_agent_events (
         run_id, user_id, sequence, emitted_at, event_type, envelope
       ) values ($1, $2, $3, to_timestamp($4::double precision / 1000.0), $5, $6::jsonb)
       on conflict (run_id, sequence) do nothing
       returning sequence`,
    [
      input.runId,
      input.userId,
      envelope.sequence,
      envelope.emittedAtMs,
      envelope.event.type,
      envelope,
    ],
  );

  if (inserted.length === 0) {
    return requireRun(
      await tx.query<CloudAgentRunRow>(
        `select * from public.cloud_agent_runs where id = $1 and user_id = $2 limit 1`,
        [input.runId, input.userId],
      ),
    );
  }

  const rows = await tx.query<CloudAgentRunRow>(
    `update public.cloud_agent_runs
          set last_event_sequence = greatest(last_event_sequence, $3),
              state = case
                when $3 >= last_event_sequence then coalesce($4, state)
                else state
              end,
              completed_at = case
                when $3 < last_event_sequence then completed_at
                when $4 in ('ready_for_review', 'completed', 'failed', 'cancelled', 'archived')
                  then coalesce(completed_at, now())
                when $4 is not null then null
                else completed_at
              end,
              updated_at = now()
        where id = $1 and user_id = $2
        returning *`,
    [input.runId, input.userId, envelope.sequence, nextState ?? null],
  );
  return requireRun(rows);
}

export async function transitionCloudAgentRun(
  db: DatabaseAdapter,
  input: { userId: string; runId: string; state: AgentTaskState },
): Promise<CloudAgentRun> {
  const rows = await db.query<CloudAgentRunRow>(
    `update public.cloud_agent_runs
        set state = $3,
            completed_at = case
              when $3 in ('ready_for_review', 'completed', 'failed', 'cancelled', 'archived')
                then coalesce(completed_at, now())
              else null
            end,
            updated_at = now()
      where id = $1 and user_id = $2
      returning *`,
    [input.runId, input.userId, input.state],
  );
  return requireRun(rows);
}

export async function requestCloudAgentRunCancellation(
  db: DatabaseAdapter,
  input: { userId: string; runId: string },
): Promise<CloudAgentRun> {
  const rows = await db.query<CloudAgentRunRow>(
    `update public.cloud_agent_runs
        set cancellation_requested_at = coalesce(cancellation_requested_at, now()),
            updated_at = now()
      where id = $1 and user_id = $2
      returning *`,
    [input.runId, input.userId],
  );
  return requireRun(rows);
}

export async function isCloudAgentRunCancellationRequested(
  db: DatabaseAdapter,
  input: { userId: string; runId: string },
): Promise<boolean> {
  const rows = await db.query<{ cancellation_requested: boolean }>(
    `select cancellation_requested_at is not null as cancellation_requested
       from public.cloud_agent_runs
      where id = $1 and user_id = $2
      limit 1`,
    [input.runId, input.userId],
  );
  const row = rows[0];
  if (!row) throw new CloudAgentRunNotFoundError();
  return row.cancellation_requested;
}

export async function getCloudAgentRun(
  db: DatabaseAdapter,
  input: { userId: string; runId: string; afterSequence?: number; limit?: number },
): Promise<CloudAgentRunSnapshot | null> {
  const runRows = await db.query<CloudAgentRunRow>(
    `select * from public.cloud_agent_runs where id = $1 and user_id = $2 limit 1`,
    [input.runId, input.userId],
  );
  const runRow = runRows[0];
  if (!runRow) return null;

  const afterSequence = Math.max(-1, Math.trunc(input.afterSequence ?? -1));
  const limit = Math.min(500, Math.max(1, Math.trunc(input.limit ?? 100)));
  const eventRows = await db.query<CloudAgentEventRow>(
    `select sequence, envelope, emitted_at
       from public.cloud_agent_events
      where run_id = $1 and user_id = $2 and sequence > $3
      order by sequence asc
      limit $4`,
    [input.runId, input.userId, afterSequence, limit],
  );
  const events = eventRows.map((row) => AgentEventEnvelopeSchema.parse(row.envelope));
  return { run: mapRun(runRow), events };
}

export async function listCloudAgentRuns(
  db: DatabaseAdapter,
  input: {
    userId: string;
    states: AgentTaskState[];
    before?: CloudAgentRunCursor;
    limit?: number;
  },
): Promise<CloudAgentRunList> {
  const states = z.array(AgentTaskStateSchema).min(1).max(9).parse(input.states);
  const before = input.before
    ? z.object({ updatedAt: z.string().datetime(), id: z.string().uuid() }).parse(input.before)
    : null;
  const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 25)));
  const rows = await db.query<CloudAgentRunRow>(
    `select * from public.cloud_agent_runs
      where user_id = $1
        and state = any($2::text[])
        and ($3::timestamptz is null or (updated_at, id) < ($3::timestamptz, $4::uuid))
      order by updated_at desc, id desc
      limit $5`,
    [input.userId, states, before?.updatedAt ?? null, before?.id ?? null, limit + 1],
  );
  const pageRows = rows.slice(0, limit);
  const lastRow = pageRows.at(-1);
  return {
    runs: pageRows.map(mapRun),
    next: rows.length > limit && lastRow ? { updatedAt: lastRow.updated_at, id: lastRow.id } : null,
  };
}

/**
 * Persist the exact validated execution state before an approval request is
 * visible to a client. A later request identifies only the run; it never
 * supplies the model transcript or tool arguments that will execute.
 */
export async function saveCloudAgentApprovalCheckpoint(
  db: DatabaseAdapter,
  input: {
    userId: string;
    runId: string;
    sessionId: string;
    turnId: string;
    nextEventSequence: number;
    completedSteps: number;
    request: Record<string, unknown>;
    messages: unknown[];
    pendingToolCalls: unknown[];
    events: unknown[];
  },
): Promise<CloudAgentApprovalCheckpoint> {
  const request = z.record(z.string(), z.unknown()).parse(input.request);
  const messages = z.array(CheckpointMessageSchema).parse(input.messages);
  const pendingToolCalls = z
    .array(PendingToolCallSchema)
    .min(1)
    .max(32)
    .parse(input.pendingToolCalls);
  const nextEventSequence = z.number().int().nonnegative().parse(input.nextEventSequence);
  const completedSteps = z.number().int().nonnegative().parse(input.completedSteps);
  const events = z.array(AgentEventEnvelopeSchema).min(3).max(34).parse(input.events);
  const hasContinuousEventCursor = events.every(
    (event, index) =>
      event.sessionId === input.sessionId &&
      event.turnId === input.turnId &&
      (index === 0 || event.sequence === events[index - 1]!.sequence + 1),
  );
  if (!hasContinuousEventCursor || events[events.length - 1]!.sequence + 1 !== nextEventSequence) {
    throw new CloudAgentApprovalDecisionError(
      'Approval checkpoint events do not match the durable event cursor',
    );
  }
  const approvalEvents = events.slice(0, -2);
  const awaitingInputEvent = events.at(-2)?.event;
  const pausedEvent = events.at(-1)?.event;
  const pendingIds = new Set(pendingToolCalls.map((call) => call.id));
  const approvalIds = new Set(
    approvalEvents.flatMap((event) =>
      event.event.type === 'approval-requested' ? [event.event.toolCallId] : [],
    ),
  );
  const hasCompleteApprovalBoundary =
    approvalEvents.length === pendingIds.size &&
    approvalIds.size === pendingIds.size &&
    [...approvalIds].every((id) => pendingIds.has(id)) &&
    awaitingInputEvent?.type === 'task-state-changed' &&
    awaitingInputEvent.state === 'awaiting_input' &&
    pausedEvent?.type === 'lifecycle' &&
    pausedEvent.phase === 'paused';
  if (!hasCompleteApprovalBoundary) {
    throw new CloudAgentApprovalDecisionError(
      'Approval checkpoint events do not form a complete approval boundary',
    );
  }

  return db.transaction(async (tx) => {
    const ownedRun = await tx.query<{ id: string }>(
      `select id from public.cloud_agent_runs
        where id = $1 and user_id = $2
        for update`,
      [input.runId, input.userId],
    );
    if (!ownedRun[0]) throw new CloudAgentRunNotFoundError();

    // Reaching another approval boundary proves the previously claimed
    // checkpoint advanced successfully. Resolve that precise predecessor
    // before inserting the next version.
    await tx.query(
      `update public.cloud_agent_approval_checkpoints
          set state = 'resolved',
              resolved_at = coalesce(resolved_at, now()),
              lease_expires_at = null,
              updated_at = now()
        where run_id = $1 and user_id = $2 and state = 'resuming'`,
      [input.runId, input.userId],
    );

    const versionRows = await tx.query<{ next_version: number | string }>(
      `select coalesce(max(version), 0) + 1 as next_version
         from public.cloud_agent_approval_checkpoints
        where run_id = $1 and user_id = $2`,
      [input.runId, input.userId],
    );
    const version = z.coerce.number().int().positive().parse(versionRows[0]?.next_version);

    const checkpointRows = await tx.query<CloudAgentApprovalCheckpointRow>(
      `insert into public.cloud_agent_approval_checkpoints (
         run_id, user_id, version, session_id, turn_id, next_event_sequence,
         completed_steps, request, messages, pending_tool_calls, state
       ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, 'pending')
       returning *`,
      [
        input.runId,
        input.userId,
        version,
        input.sessionId,
        input.turnId,
        nextEventSequence,
        completedSteps,
        request,
        messages,
        pendingToolCalls,
      ],
    );

    // These envelopes were buffered by the tool loop and have not been shown
    // to the client yet. Commit them in this same transaction so the persisted
    // continuation cursor can never jump over an approval event after a
    // disconnect or process crash. Live streaming re-appends them safely via
    // the run journal's (run_id, sequence) idempotency key.
    for (const event of events) {
      await appendCloudAgentEventWithinTransaction(tx, {
        userId: input.userId,
        runId: input.runId,
        envelope: event,
      });
    }

    await tx.query<CloudAgentRunRow>(
      `update public.cloud_agent_runs
          set state = 'awaiting_input', completed_at = null, updated_at = now()
        where id = $1 and user_id = $2
        returning *`,
      [input.runId, input.userId],
    );
    return requireApprovalCheckpoint(checkpointRows);
  });
}

/**
 * Atomically bind a complete decision set to the latest pending checkpoint.
 * Exact set equality prevents forged ids, omitted calls, and double resumes.
 */
export async function claimCloudAgentApprovalCheckpoint(
  db: DatabaseAdapter,
  input: {
    userId: string;
    runId: string;
    approvals: CloudAgentApprovalDecision[];
    leaseSeconds?: number;
  },
): Promise<ClaimedCloudAgentApprovalCheckpoint> {
  const approvals = z
    .array(
      z.object({
        toolCallId: z.string().min(1).max(256),
        decision: z.enum(['approved', 'rejected']),
      }),
    )
    .min(1)
    .max(32)
    .parse(input.approvals);
  const leaseSeconds = Math.min(86_400, Math.max(60, Math.trunc(input.leaseSeconds ?? 900)));

  return db.transaction(async (tx) => {
    const rows = await tx.query<CloudAgentApprovalCheckpointRow>(
      `select * from public.cloud_agent_approval_checkpoints
        where run_id = $1 and user_id = $2 and state = 'pending'
        order by version desc
        limit 1
        for update`,
      [input.runId, input.userId],
    );
    const checkpoint = requireApprovalCheckpoint(rows);
    const pendingIds = new Set(checkpoint.pendingToolCalls.map((call) => call.id));
    const decisionIds = new Set(approvals.map((approval) => approval.toolCallId));
    const exactMatch =
      decisionIds.size === approvals.length &&
      decisionIds.size === pendingIds.size &&
      [...decisionIds].every((id) => pendingIds.has(id));
    if (!exactMatch) throw new CloudAgentApprovalDecisionError();

    const leaseToken = randomUUID();
    const claimedRows = await tx.query<CloudAgentApprovalCheckpointRow>(
      `update public.cloud_agent_approval_checkpoints
          set state = 'resuming',
              lease_token = $3,
              lease_expires_at = now() + make_interval(secs => $4),
              updated_at = now()
        where id = $1 and user_id = $2 and state = 'pending'
        returning *`,
      [checkpoint.id, input.userId, leaseToken, leaseSeconds],
    );
    const claimed = requireApprovalCheckpoint(
      claimedRows,
      new CloudAgentApprovalCheckpointConflictError(),
    );
    await tx.query<CloudAgentRunRow>(
      `update public.cloud_agent_runs
          set state = 'running', completed_at = null, updated_at = now()
        where id = $1 and user_id = $2
        returning *`,
      [input.runId, input.userId],
    );
    if (!claimed.leaseToken) throw new CloudAgentApprovalCheckpointConflictError();
    return { checkpoint: claimed, approvals, leaseToken: claimed.leaseToken };
  });
}

/** Mark only the lease that actually drove the continuation as terminal. */
export async function completeCloudAgentApprovalCheckpoint(
  db: DatabaseAdapter,
  input: {
    userId: string;
    checkpointId: string;
    leaseToken: string;
    outcome?: 'resolved' | 'failed';
  },
): Promise<CloudAgentApprovalCheckpoint> {
  const outcome = input.outcome ?? 'resolved';
  const rows = await db.query<CloudAgentApprovalCheckpointRow>(
    `update public.cloud_agent_approval_checkpoints
        set state = case when state = 'resuming' then $3 else state end,
            resolved_at = coalesce(resolved_at, now()),
            lease_expires_at = null,
            updated_at = now()
      where id = $1 and user_id = $2 and lease_token = $4
        and state in ('resuming', 'resolved', 'failed')
      returning *`,
    [input.checkpointId, input.userId, outcome, input.leaseToken],
  );
  return requireApprovalCheckpoint(
    rows,
    new CloudAgentApprovalCheckpointConflictError('Approval checkpoint lease is no longer active'),
  );
}

/**
 * Return a claimed checkpoint to pending only before execution begins. The
 * exact lease token prevents one continuation from releasing another.
 */
export async function releaseCloudAgentApprovalCheckpoint(
  db: DatabaseAdapter,
  input: {
    userId: string;
    runId: string;
    checkpointId: string;
    leaseToken: string;
  },
): Promise<CloudAgentApprovalCheckpoint> {
  return db.transaction(async (tx) => {
    const rows = await tx.query<CloudAgentApprovalCheckpointRow>(
      `update public.cloud_agent_approval_checkpoints
          set state = 'pending',
              lease_token = null,
              lease_expires_at = null,
              updated_at = now()
        where id = $1 and user_id = $2 and lease_token = $3 and state = 'resuming'
        returning *`,
      [input.checkpointId, input.userId, input.leaseToken],
    );
    const checkpoint = requireApprovalCheckpoint(
      rows,
      new CloudAgentApprovalCheckpointConflictError(
        'Approval checkpoint lease is no longer active',
      ),
    );
    await tx.query<CloudAgentRunRow>(
      `update public.cloud_agent_runs
          set state = 'awaiting_input', completed_at = null, updated_at = now()
        where id = $1 and user_id = $2
        returning *`,
      [input.runId, input.userId],
    );
    return checkpoint;
  });
}

export function isCloudAgentRunTerminal(state: AgentTaskState): boolean {
  return TERMINAL_STATES.has(state);
}
