import 'server-only';

import { randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  AgentEventEnvelopeSchema,
  AgentTaskStateSchema,
  CloudAgentRunSchema,
  ManagedCloudAgentRunRequestIdSchema,
  MAX_CLOUD_AGENT_PENDING_APPROVAL_ARGS_PREVIEW_LENGTH,
  readPersistedInteractiveCards,
  type CloudAgentOriginSurface,
  type CloudAgentRun,
  type CloudAgentRunUsage,
  type CloudAgentWorkMode,
} from '@agiworkforce/cloud-contracts';
import {
  INTERACTIVE_CARDS_METADATA_KEY,
  type CloudWorkMode,
  type InteractiveCard,
} from '@agiworkforce/types';
import type { AgentEventEnvelope, AgentTaskState } from '@agiworkforce/types/protocol';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { toIsoTimestamp } from '@/lib/server/iso-timestamps';
import { notifyAgentRunEvent, type AgentRunNotice } from './agent-notification-service';

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
  /** Joined by {@link listCloudAgentRuns} only; absent on every other read. */
  conversation_title?: string | null;
  origin_surface: string;
  work_mode: string;
  state: string;
  provider: string;
  model: string;
  last_event_sequence: number | string;
  cancellation_requested_at: string | Date | null;
  completed_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  pending_approval_requested_at?: string | Date | null;
  pending_approval_tool_calls?: unknown;
  pending_input_requested_at?: string | Date | null;
  pending_input_tool_calls?: unknown;
  pending_input_requests?: unknown;
  pending_input_request_state?: unknown;
  settled_usage?: unknown;
  /** Pre-update state, returned only by the two statements that move `state`. */
  previous_state?: string | null;
}

/**
 * Delivering a notification must never break a run. Mirrors the isolation
 * `announceScheduleRun` in schedule-service.ts puts around the one other
 * push producer in the app.
 */
async function announceAgentRunEvent(db: DatabaseAdapter, notice: AgentRunNotice): Promise<void> {
  try {
    await notifyAgentRunEvent(db, notice);
  } catch (error) {
    logger.warn({ error, runId: notice.runId }, 'Cloud agent run notification failed');
  }
}

/**
 * Terminal states worth telling the user about. `cancelled` is the user's own
 * doing, schedule notifications skip it for the same reason, and `archived`
 * is bookkeeping.
 */
const NOTIFIED_TERMINAL_EVENTS: Partial<Record<AgentTaskState, 'completed' | 'failed'>> = {
  ready_for_review: 'completed',
  completed: 'completed',
  failed: 'failed',
};

/**
 * Decides, from one statement's own before/after view of `cloud_agent_runs`,
 * whether this write is the one that carried a run into a terminal state.
 *
 * Two writers move a run's state: the event journal
 * ({@link appendCloudAgentEventsWithinTransaction}, which derives the state from
 * a `task-state-changed` envelope) and {@link transitionCloudAgentRun}. The
 * journal always writes first on the workflow path, the tool loop emits
 * `ready_for_review`/`failed` before the workflow settles, so a decision made
 * anywhere downstream of it can only ever see an already-terminal run. Both
 * writers therefore read the pre-update row in the same locked statement and
 * ask here; whichever one actually performs the transition owes the notice, and
 * the other sees a terminal `previousState` and stays silent.
 */
function terminalNoticeFor(input: {
  nextState: AgentTaskState | null | undefined;
  previousState: string | null;
  currentState: string;
}): 'completed' | 'failed' | null {
  if (!input.nextState) return null;
  const event = NOTIFIED_TERMINAL_EVENTS[input.nextState];
  if (!event) return null;
  // No pre-update state means we cannot prove this call is the transition, so
  // stay silent rather than notify twice.
  if (!input.previousState) return null;
  if (TERMINAL_STATES.has(input.previousState as AgentTaskState)) return null;
  // An out-of-order envelope leaves the state where it was; only the write that
  // actually landed the terminal state owes the notice.
  if (input.currentState !== input.nextState) return null;
  return event;
}

function previousStateOf(row: CloudAgentRunRow | undefined): string | null {
  return typeof row?.previous_state === 'string' ? row.previous_state : null;
}

interface CloudAgentEventRow extends Record<string, unknown> {
  sequence: number | string;
  envelope: unknown;
  emitted_at: string | Date;
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
const CheckpointKindSchema = z.enum(['approval', 'input']);

const InputRequestsMapSchema = z.record(z.string(), z.record(z.string(), z.unknown()));
const RequestStateEntrySchema = z.object({
  requestState: z.string().optional(),
  round: z.number().int().nonnegative(),
});
const RequestStateMapSchema = z.record(z.string(), RequestStateEntrySchema);

function connectorIdFromQualifiedName(qualifiedName: string): string {
  const parts = qualifiedName.split('__');
  return parts[0] === 'mcp' && parts.length >= 3 && parts[1] ? parts[1] : qualifiedName;
}

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
  checkpoint_kind?: string;
  input_requests?: unknown;
  request_state?: unknown;
  lease_token: string | null;
  lease_expires_at: string | Date | null;
  resolved_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
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

export type CloudAgentCheckpointKind = z.infer<typeof CheckpointKindSchema>;

export interface CloudAgentInputCheckpoint extends CloudAgentApprovalCheckpoint {
  /** UNTRUSTED remote input-request field definitions, keyed by tool call id. */
  inputRequests: Record<string, Record<string, unknown>>;
  /** Host-owned per-call continuation metadata, keyed by tool call id. */
  requestState: Record<string, { requestState?: string; round: number }>;
}

export interface CloudAgentInputResponse {
  toolCallId: string;
  inputResponses: Record<string, unknown>;
}

export interface CloudAgentInputResumption {
  toolCallId: string;
  inputResponses: Record<string, unknown>;
  requestState?: string;
  /** The attempt round to run next: the paused round plus one. */
  round: number;
}

export interface ClaimedCloudAgentInputCheckpoint {
  checkpoint: CloudAgentInputCheckpoint;
  resumptions: CloudAgentInputResumption[];
  leaseToken: string;
}

export class CloudAgentInputResponseError extends Error {
  constructor(message = 'Input responses do not match the paused tool calls') {
    super(message);
    this.name = 'CloudAgentInputResponseError';
  }
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

export class CloudAgentApprovalCheckpointExpiredError extends Error {
  constructor(message = 'Cloud agent approval checkpoint has expired') {
    super(message);
    this.name = 'CloudAgentApprovalCheckpointExpiredError';
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

export const APPROVAL_CHECKPOINT_TTL_HOURS = 24;

const PENDING_APPROVAL_LATERAL = `
  left join lateral (
    select checkpoint.created_at, checkpoint.pending_tool_calls
      from public.cloud_agent_approval_checkpoints checkpoint
     where checkpoint.run_id = runs.id
       and checkpoint.user_id = runs.user_id
       and checkpoint.checkpoint_kind = 'approval'
       and checkpoint.state = 'pending'
       and checkpoint.created_at > now() - make_interval(hours => ${APPROVAL_CHECKPOINT_TTL_HOURS})
     order by checkpoint.version desc
     limit 1
  ) pending on true`;

const PENDING_APPROVAL_COLUMNS = `
  pending.created_at as pending_approval_requested_at,
  pending.pending_tool_calls as pending_approval_tool_calls`;

const PENDING_INPUT_LATERAL = `
  left join lateral (
    select checkpoint.created_at, checkpoint.pending_tool_calls,
           checkpoint.input_requests, checkpoint.request_state
      from public.cloud_agent_approval_checkpoints checkpoint
     where checkpoint.run_id = runs.id
       and checkpoint.user_id = runs.user_id
       and checkpoint.checkpoint_kind = 'input'
       and checkpoint.state = 'pending'
       and checkpoint.created_at > now() - make_interval(hours => ${APPROVAL_CHECKPOINT_TTL_HOURS})
     order by checkpoint.version desc
     limit 1
  ) pending_input on true`;

const PENDING_INPUT_COLUMNS = `
  pending_input.created_at as pending_input_requested_at,
  pending_input.pending_tool_calls as pending_input_tool_calls,
  pending_input.input_requests as pending_input_requests,
  pending_input.request_state as pending_input_request_state`;

function mapPendingApproval(row: CloudAgentRunRow): CloudAgentRun['pendingApproval'] {
  const requestedAt = toIsoTimestamp(row.pending_approval_requested_at ?? null);
  if (!requestedAt) return undefined;
  const parsed = z
    .array(PendingToolCallSchema)
    .min(1)
    .max(32)
    .safeParse(row.pending_approval_tool_calls);
  if (!parsed.success) return undefined;
  return {
    requestedAt,
    toolCalls: parsed.data.map((call) => ({
      toolCallId: call.id,
      name: call.qualifiedName,
      argsPreview: JSON.stringify(call.args).slice(
        0,
        MAX_CLOUD_AGENT_PENDING_APPROVAL_ARGS_PREVIEW_LENGTH,
      ),
    })),
  };
}

function mapPendingInput(row: CloudAgentRunRow): CloudAgentRun['pendingInput'] {
  const requestedAt = toIsoTimestamp(row.pending_input_requested_at ?? null);
  if (!requestedAt) return undefined;
  const calls = z
    .array(PendingToolCallSchema)
    .min(1)
    .max(32)
    .safeParse(row.pending_input_tool_calls);
  if (!calls.success) return undefined;
  const requests = InputRequestsMapSchema.safeParse(row.pending_input_requests ?? {});
  const stateMap = RequestStateMapSchema.safeParse(row.pending_input_request_state ?? {});
  if (!requests.success || !stateMap.success) return undefined;
  return {
    requestedAt,
    toolCalls: calls.data.map((call) => ({
      toolCallId: call.id,
      name: call.qualifiedName,
      connectorId: connectorIdFromQualifiedName(call.qualifiedName),
      round: stateMap.data[call.id]?.round ?? 0,
      inputRequests: requests.data[call.id] ?? {},
    })),
  };
}

const SettledUsageEntrySchema = z.object({
  providerCalls: z.number().int().min(0),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  reasoningTokens: z.number().int().min(0),
  costCents: z.number().int().min(0).nullable(),
  settledAt: z.string().datetime(),
});

export type CloudAgentRunSettledUsage = z.infer<typeof SettledUsageEntrySchema>;

function mapSettledUsage(row: CloudAgentRunRow): CloudAgentRun['usage'] {
  const parsed = z.record(z.string(), SettledUsageEntrySchema).safeParse(row.settled_usage ?? {});
  if (!parsed.success) return undefined;
  const entries = Object.values(parsed.data);
  if (entries.length === 0) return undefined;
  const charged = entries.filter((entry) => entry.costCents !== null);
  return {
    providerCalls: entries.reduce((total, entry) => total + entry.providerCalls, 0),
    inputTokens: entries.reduce((total, entry) => total + entry.inputTokens, 0),
    outputTokens: entries.reduce((total, entry) => total + entry.outputTokens, 0),
    reasoningTokens: entries.reduce((total, entry) => total + entry.reasoningTokens, 0),
    costCents:
      charged.length === 0
        ? null
        : charged.reduce((total, entry) => total + (entry.costCents ?? 0), 0),
    settledAt: entries.reduce(
      (latest, entry) => (entry.settledAt > latest ? entry.settledAt : latest),
      entries[0]!.settledAt,
    ),
  };
}

function mapRun(row: CloudAgentRunRow): CloudAgentRun {
  const pendingApproval = mapPendingApproval(row);
  const pendingInput = mapPendingInput(row);
  const usage = mapSettledUsage(row);
  return CloudAgentRunSchema.parse({
    ...(pendingApproval ? { pendingApproval } : {}),
    ...(pendingInput ? { pendingInput } : {}),
    ...(usage ? { usage } : {}),
    id: row.id,
    userId: row.user_id,
    requestId: row.request_id,
    conversationId: row.conversation_id,
    ...(row.conversation_title ? { conversationTitle: row.conversation_title } : {}),
    originSurface: row.origin_surface,
    workMode: row.work_mode,
    state: row.state,
    provider: row.provider,
    model: row.model,
    lastEventSequence: Number(row.last_event_sequence),
    cancellationRequestedAt: toIsoTimestamp(row.cancellation_requested_at),
    completedAt: toIsoTimestamp(row.completed_at),
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
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
    leaseExpiresAt: z.string().datetime().nullable().parse(toIsoTimestamp(row.lease_expires_at)),
    resolvedAt: z.string().datetime().nullable().parse(toIsoTimestamp(row.resolved_at)),
    createdAt: z.string().datetime().parse(toIsoTimestamp(row.created_at)),
    updatedAt: z.string().datetime().parse(toIsoTimestamp(row.updated_at)),
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

export async function findActiveCloudAgentRunForConversation(
  db: DatabaseAdapter,
  input: { userId: string; conversationId: string; excludeRequestId?: string },
): Promise<CloudAgentRun | null> {
  const rows = await db.query<CloudAgentRunRow>(
    `select * from public.cloud_agent_runs
        where user_id = $1
          and conversation_id = $2
          and state in ('running', 'queued')
          and cancellation_requested_at is null
          and ($3::text is null or request_id <> $3)
        order by created_at asc
        limit 1`,
    [input.userId, input.conversationId, input.excludeRequestId ?? null],
  );
  const row = rows[0];
  return row ? mapRun(row) : null;
}

export async function appendCloudAgentEvent(
  db: DatabaseAdapter,
  input: { userId: string; runId: string; envelope: AgentEventEnvelope },
): Promise<CloudAgentRun> {
  return appendCloudAgentEvents(db, {
    userId: input.userId,
    runId: input.runId,
    envelopes: [input.envelope],
  });
}

/**
 * Journal a whole batch of envelopes in ONE transaction.
 *
 * The streaming paths emit a `text-delta` envelope per provider SSE line, and
 * journalling each one on its own cost a full RLS transaction, connect,
 * `BEGIN; SET LOCAL ROLE app_rls`, `set_config`, INSERT, locked UPDATE, COMMIT,
 * release, roughly six round trips per token, on the critical path of the
 * stream, holding one of the pool's clients throughout. Callers coalesce the
 * deltas (see `createCloudAgentEventJournal`) and land them here as a single
 * multi-row INSERT plus one run-row update, which is what keeps a long answer
 * from issuing thousands of serialized transactions against a pool of tens.
 */
export async function appendCloudAgentEvents(
  db: DatabaseAdapter,
  input: { userId: string; runId: string; envelopes: readonly AgentEventEnvelope[] },
): Promise<CloudAgentRun> {
  const envelopes = input.envelopes.map((envelope) => AgentEventEnvelopeSchema.parse(envelope));
  if (envelopes.length === 0) {
    return requireRun(
      await db.query<CloudAgentRunRow>(
        `select * from public.cloud_agent_runs where id = $1 and user_id = $2 limit 1`,
        [input.runId, input.userId],
      ),
    );
  }

  const { run, notice } = await db.transaction((tx) =>
    appendCloudAgentEventsWithinTransaction(tx, {
      userId: input.userId,
      runId: input.runId,
      envelopes,
    }),
  );

  // Announced after the commit, never inside it: a rolled-back journal write
  // must not leave a push behind, and a push must not hold a transaction open.
  if (notice) {
    await announceAgentRunEvent(db, { userId: input.userId, runId: input.runId, event: notice });
  }
  return run;
}

interface AppendedCloudAgentEvent {
  run: CloudAgentRun;
  /** Set only when this append is the write that made the run terminal. */
  notice: 'completed' | 'failed' | null;
}

const EVENT_INSERT_COLUMNS_PER_ROW = 4;

/** `run_id` and `user_id` are shared by every tuple in the multi-row insert. */
const FIXED_EVENT_INSERT_PARAMS = 2;

function buildEventInsertValues(envelopes: readonly AgentEventEnvelope[]): {
  tuples: string;
  params: unknown[];
} {
  const tuples: string[] = [];
  const params: unknown[] = [];
  for (const [index, envelope] of envelopes.entries()) {
    const base = FIXED_EVENT_INSERT_PARAMS + index * EVENT_INSERT_COLUMNS_PER_ROW;
    tuples.push(
      `($1, $2, $${base + 1}, to_timestamp($${base + 2}::double precision / 1000.0), $${base + 3}, $${base + 4}::jsonb)`,
    );
    params.push(envelope.sequence, envelope.emittedAtMs, envelope.event.type, envelope);
  }
  return { tuples: tuples.join(', '), params };
}

async function appendCloudAgentEventsWithinTransaction(
  tx: DatabaseAdapter,
  input: { userId: string; runId: string; envelopes: readonly AgentEventEnvelope[] },
): Promise<AppendedCloudAgentEvent> {
  const { tuples, params } = buildEventInsertValues(input.envelopes);

  const inserted = await tx.query<{ sequence: number | string }>(
    `insert into public.cloud_agent_events (
         run_id, user_id, sequence, emitted_at, event_type, envelope
       ) values ${tuples}
       on conflict (run_id, sequence) do nothing
       returning sequence`,
    [input.runId, input.userId, ...params],
  );

  // A replayed envelope loses the `(run_id, sequence)` race and never reaches
  // the state update, so a retried workflow step cannot re-announce a terminal
  // it already announced. The event row is the persisted de-duplication marker.
  if (inserted.length === 0) {
    return {
      run: requireRun(
        await tx.query<CloudAgentRunRow>(
          `select * from public.cloud_agent_runs where id = $1 and user_id = $2 limit 1`,
          [input.runId, input.userId],
        ),
      ),
      notice: null,
    };
  }

  const persisted = new Set(inserted.map((row) => Number(row.sequence)));
  const highestSequence = input.envelopes.reduce(
    (highest, envelope) => Math.max(highest, envelope.sequence),
    0,
  );
  // Only a `task-state-changed` envelope that actually landed may move the run,
  // and when several are batched the last one wins, the batch is ordered.
  const stateEnvelope = [...input.envelopes]
    .reverse()
    .find(
      (envelope) =>
        envelope.event.type === 'task-state-changed' && persisted.has(envelope.sequence),
    );
  const nextState =
    stateEnvelope?.event.type === 'task-state-changed' ? stateEnvelope.event.state : undefined;

  // `previous` locks the row and reads its committed pre-update snapshot, so
  // concurrent appends serialise and only the first sees a non-terminal state.
  const rows = await tx.query<CloudAgentRunRow>(
    `with previous as (
          select id, state from public.cloud_agent_runs
           where id = $1 and user_id = $2
           for update
        )
        update public.cloud_agent_runs as runs
          set last_event_sequence = greatest(runs.last_event_sequence, $3::bigint),
              state = case
                when $4::text is not null and $5::bigint >= runs.last_event_sequence then $4::text
                else runs.state
              end,
              completed_at = case
                when $4::text is null then runs.completed_at
                when $5::bigint < runs.last_event_sequence then runs.completed_at
                when $4::text in ('ready_for_review', 'completed', 'failed', 'cancelled', 'archived')
                  then coalesce(runs.completed_at, now())
                else null
              end,
              updated_at = now()
        from previous
        where runs.id = previous.id and runs.user_id = $2
        returning runs.*, previous.state as previous_state`,
    [
      input.runId,
      input.userId,
      highestSequence,
      nextState ?? null,
      stateEnvelope?.sequence ?? highestSequence,
    ],
  );
  const run = requireRun(rows);
  return {
    run,
    notice: terminalNoticeFor({
      nextState,
      previousState: previousStateOf(rows[0]),
      currentState: run.state,
    }),
  };
}

export async function transitionCloudAgentRun(
  db: DatabaseAdapter,
  input: { userId: string; runId: string; state: AgentTaskState },
): Promise<CloudAgentRun> {
  // The `previous` CTE locks the row and reads its pre-update snapshot, so a
  // repeated transition into the same terminal state, and, on the workflow
  // path, a settle that follows a journal write that already moved the run.
  // notifies at most once.
  const rows = await db.query<CloudAgentRunRow>(
    `with previous as (
        select id, state from public.cloud_agent_runs
         where id = $1 and user_id = $2
         for update
      )
      update public.cloud_agent_runs as runs
        set state = $3,
            completed_at = case
              when $3 in ('ready_for_review', 'completed', 'failed', 'cancelled', 'archived')
                then coalesce(runs.completed_at, now())
              else null
            end,
            updated_at = now()
      from previous
      where runs.id = previous.id and runs.user_id = $2
      returning runs.*, previous.state as previous_state`,
    [input.runId, input.userId, input.state],
  );
  const run = requireRun(rows);

  const notice = terminalNoticeFor({
    nextState: input.state,
    previousState: previousStateOf(rows[0]),
    currentState: input.state,
  });
  if (notice) {
    await announceAgentRunEvent(db, { userId: input.userId, runId: input.runId, event: notice });
  }
  return run;
}

export async function recordCloudAgentRunSettledUsage(
  db: DatabaseAdapter,
  input: {
    userId: string;
    runId: string;
    billingIdempotencyKey: string;
    usage: {
      providerCalls: number;
      inputTokens: number;
      outputTokens: number;
      reasoningTokens: number;
      costCents: number | null;
    };
  },
): Promise<CloudAgentRun | null> {
  const billingIdempotencyKey = z.string().min(8).max(128).parse(input.billingIdempotencyKey);
  const counter = z.coerce.number().int().nonnegative().safe();
  const entry: CloudAgentRunUsage = SettledUsageEntrySchema.parse({
    providerCalls: counter.parse(input.usage.providerCalls),
    inputTokens: counter.parse(input.usage.inputTokens),
    outputTokens: counter.parse(input.usage.outputTokens),
    reasoningTokens: counter.parse(input.usage.reasoningTokens),
    costCents: input.usage.costCents === null ? null : counter.parse(input.usage.costCents),
    settledAt: new Date().toISOString(),
  });
  const rows = await db.query<CloudAgentRunRow>(
    `update public.cloud_agent_runs
        set settled_usage = settled_usage || jsonb_build_object($3::text, $4::jsonb),
            updated_at = now()
      where id = $1 and user_id = $2
      returning *`,
    [input.runId, input.userId, billingIdempotencyKey, entry],
  );
  const row = rows[0];
  return row ? mapRun(row) : null;
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
    `select runs.*, ${PENDING_APPROVAL_COLUMNS}, ${PENDING_INPUT_COLUMNS}
       from public.cloud_agent_runs runs
       ${PENDING_APPROVAL_LATERAL}
       ${PENDING_INPUT_LATERAL}
      where runs.id = $1 and runs.user_id = $2
      limit 1`,
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
    requestId?: string;
    before?: CloudAgentRunCursor;
    limit?: number;
    /** Restrict to runs started in these work modes. Omit for every mode. */
    workModes?: readonly CloudWorkMode[];
  },
): Promise<CloudAgentRunList> {
  const states = z.array(AgentTaskStateSchema).min(1).max(9).parse(input.states);
  const requestId = ManagedCloudAgentRunRequestIdSchema.optional().parse(input.requestId);
  const before = input.before
    ? z.object({ updatedAt: z.string().datetime(), id: z.string().uuid() }).parse(input.before)
    : null;
  const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 25)));
  const workModes = input.workModes?.length ? [...input.workModes] : null;
  // The conversation title is the only human name a run has: the runs table
  // stores none, so a list of them is otherwise headed by its work mode and
  // every agiwork row reads identically. Left-joined because a run may have no
  // conversation, and the row is dropped when the conversation is.
  const rows = await db.query<CloudAgentRunRow>(
    `select runs.*, conversations.title as conversation_title,
            ${PENDING_APPROVAL_COLUMNS}, ${PENDING_INPUT_COLUMNS}
       from public.cloud_agent_runs runs
       left join public.web_conversations conversations
         on conversations.id = runs.conversation_id
        and conversations.deleted_at is null
       ${PENDING_APPROVAL_LATERAL}
       ${PENDING_INPUT_LATERAL}
      where runs.user_id = $1
        and runs.state = any($2::text[])
        and ($3::text is null or runs.request_id = $3)
        and ($4::timestamptz is null or (runs.updated_at, runs.id) < ($4::timestamptz, $5::uuid))
        and ($7::text[] is null or runs.work_mode = any($7::text[]))
      order by runs.updated_at desc, runs.id desc
      limit $6`,
    [
      input.userId,
      states,
      requestId ?? null,
      before?.updatedAt ?? null,
      before?.id ?? null,
      limit + 1,
      workModes,
    ],
  );
  const pageRows = rows.slice(0, limit);
  const lastRow = pageRows.at(-1);
  return {
    runs: pageRows.map(mapRun),
    next:
      rows.length > limit && lastRow
        ? {
            updatedAt: z.string().datetime().parse(toIsoTimestamp(lastRow.updated_at)),
            id: lastRow.id,
          }
        : null,
  };
}

export interface CloudAgentRunAssistantText {
  text: string;
  lastSequence: number;
  interactiveCards: InteractiveCard[];
}

export async function readCloudAgentRunAssistantText(
  db: DatabaseAdapter,
  input: { userId: string; runId: string },
): Promise<CloudAgentRunAssistantText> {
  const rows = await db.query<{
    text: string | null;
    last_sequence: number | string | null;
    interactive_cards: unknown;
  }>(
    `select coalesce(
              string_agg(envelope->'event'->>'delta', '' order by sequence)
                filter (where envelope->'event'->>'type' = 'text-delta'
                          and jsonb_typeof(envelope->'event'->'delta') = 'string'),
              ''
            ) as text,
            coalesce(max(sequence), -1) as last_sequence,
            coalesce(
              (select jsonb_agg(operation.result->'interactiveCard'
                                order by operation.created_at, operation.id)
                 from public.cloud_agent_execution_operations operation
                where operation.run_id = $1
                  and operation.user_id = $2
                  and operation.operation_kind = 'tool'
                  and operation.status = 'completed'
                  and jsonb_typeof(operation.result->'interactiveCard') = 'object'),
              '[]'::jsonb
            ) as interactive_cards
       from public.cloud_agent_events
      where run_id = $1 and user_id = $2`,
    [input.runId, input.userId],
  );
  const row = rows[0];
  return {
    text: row?.text ?? '',
    lastSequence: z.coerce
      .number()
      .int()
      .min(-1)
      .catch(-1)
      .parse(row?.last_sequence ?? -1),
    interactiveCards: readPersistedInteractiveCards({
      [INTERACTIVE_CARDS_METADATA_KEY]: row?.interactive_cards,
    }),
  };
}

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

  const checkpoint = await db.transaction(async (tx) => {
    const ownedRun = await tx.query<{ id: string }>(
      `select id from public.cloud_agent_runs
        where id = $1 and user_id = $2
        for update`,
      [input.runId, input.userId],
    );
    if (!ownedRun[0]) throw new CloudAgentRunNotFoundError();

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

    // A pause transaction ends with the run `awaiting_input`, so a terminal
    // notice from a checkpoint event is never a terminal this run reached.
    if (events.length > 0) {
      await appendCloudAgentEventsWithinTransaction(tx, {
        userId: input.userId,
        runId: input.runId,
        envelopes: events,
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

  await announceAgentRunEvent(db, {
    userId: input.userId,
    runId: input.runId,
    event: 'approval_required',
    toolName: pendingToolCalls[0]?.qualifiedName ?? null,
  });
  return checkpoint;
}

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
          and created_at > now() - make_interval(hours => $3)
        order by version desc
        limit 1
        for update`,
      [input.runId, input.userId, APPROVAL_CHECKPOINT_TTL_HOURS],
    );
    if (!rows[0]) {
      const expiredRows = await tx.query<{ id: string }>(
        `select id from public.cloud_agent_approval_checkpoints
          where run_id = $1 and user_id = $2 and state = 'pending'
          limit 1`,
        [input.runId, input.userId],
      );
      if (expiredRows[0]) throw new CloudAgentApprovalCheckpointExpiredError();
    }
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
    const resumedRuns = await tx.query<CloudAgentRunRow>(
      `update public.cloud_agent_runs
          set state = 'running', completed_at = null, updated_at = now()
        where id = $1 and user_id = $2
          and state in ('queued', 'running', 'awaiting_input', 'paused')
        returning *`,
      [input.runId, input.userId],
    );
    if (!resumedRuns[0]) {
      throw new CloudAgentApprovalCheckpointConflictError('Cloud agent run is no longer resumable');
    }
    if (!claimed.leaseToken) throw new CloudAgentApprovalCheckpointConflictError();
    return { checkpoint: claimed, approvals, leaseToken: claimed.leaseToken };
  });
}

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

function mapInputCheckpoint(row: CloudAgentApprovalCheckpointRow): CloudAgentInputCheckpoint {
  const base = mapApprovalCheckpoint(row);
  return {
    ...base,
    inputRequests: InputRequestsMapSchema.parse(row.input_requests ?? {}),
    requestState: RequestStateMapSchema.parse(row.request_state ?? {}),
  };
}

function requireInputCheckpoint(
  rows: CloudAgentApprovalCheckpointRow[],
  error: Error = new CloudAgentApprovalCheckpointNotFoundError(),
): CloudAgentInputCheckpoint {
  const row = rows[0];
  if (!row) throw error;
  return mapInputCheckpoint(row);
}

/**
 * Persist a durable MCP `input_required` (MRTR) pause. This is the same
 * server-owned pause boundary as {@link saveCloudAgentApprovalCheckpoint}: the
 * validated transcript, event cursor, and paused call stay tenant-owned; the
 * client only supplies the collected responses on resume. The event boundary
 * must be exactly one `input-requested` per paused call, then
 * `task-state-changed:awaiting_input`, then `lifecycle:paused`.
 */
export async function saveCloudAgentInputCheckpoint(
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
    inputRequests: Record<string, Record<string, unknown>>;
    requestState: Record<string, { requestState?: string; round: number }>;
    events: unknown[];
  },
): Promise<CloudAgentInputCheckpoint> {
  const request = z.record(z.string(), z.unknown()).parse(input.request);
  const messages = z.array(CheckpointMessageSchema).parse(input.messages);
  const pendingToolCalls = z
    .array(PendingToolCallSchema)
    .min(1)
    .max(32)
    .parse(input.pendingToolCalls);
  const inputRequests = InputRequestsMapSchema.parse(input.inputRequests);
  const requestState = RequestStateMapSchema.parse(input.requestState);
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
    throw new CloudAgentInputResponseError(
      'Input checkpoint events do not match the durable event cursor',
    );
  }
  const inputEvents = events.slice(0, -2);
  const awaitingInputEvent = events.at(-2)?.event;
  const pausedEvent = events.at(-1)?.event;
  const pendingIds = new Set(pendingToolCalls.map((call) => call.id));
  const requestedIds = new Set(
    inputEvents.flatMap((event) =>
      event.event.type === 'input-requested' ? [event.event.toolCallId] : [],
    ),
  );
  const hasCompleteInputBoundary =
    inputEvents.length === pendingIds.size &&
    requestedIds.size === pendingIds.size &&
    [...requestedIds].every((id) => pendingIds.has(id)) &&
    [...pendingIds].every(
      (id) => inputRequests[id] !== undefined && requestState[id] !== undefined,
    ) &&
    awaitingInputEvent?.type === 'task-state-changed' &&
    awaitingInputEvent.state === 'awaiting_input' &&
    pausedEvent?.type === 'lifecycle' &&
    pausedEvent.phase === 'paused';
  if (!hasCompleteInputBoundary) {
    throw new CloudAgentInputResponseError(
      'Input checkpoint events do not form a complete input boundary',
    );
  }

  const checkpoint = await db.transaction(async (tx) => {
    const ownedRun = await tx.query<{ id: string }>(
      `select id from public.cloud_agent_runs
        where id = $1 and user_id = $2
        for update`,
      [input.runId, input.userId],
    );
    if (!ownedRun[0]) throw new CloudAgentRunNotFoundError();

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
         completed_steps, request, messages, pending_tool_calls, state,
         checkpoint_kind, input_requests, request_state
       ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, 'pending',
         'input', $11::jsonb, $12::jsonb)
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
        inputRequests,
        requestState,
      ],
    );

    // A pause transaction ends with the run `awaiting_input`, so a terminal
    // notice from a checkpoint event is never a terminal this run reached.
    if (events.length > 0) {
      await appendCloudAgentEventsWithinTransaction(tx, {
        userId: input.userId,
        runId: input.runId,
        envelopes: events,
      });
    }

    await tx.query<CloudAgentRunRow>(
      `update public.cloud_agent_runs
          set state = 'awaiting_input', completed_at = null, updated_at = now()
        where id = $1 and user_id = $2
        returning *`,
      [input.runId, input.userId],
    );
    return requireInputCheckpoint(checkpointRows);
  });

  await announceAgentRunEvent(db, {
    userId: input.userId,
    runId: input.runId,
    event: 'input_required',
    toolName: pendingToolCalls[0]?.qualifiedName ?? null,
  });
  return checkpoint;
}

export async function claimCloudAgentInputCheckpoint(
  db: DatabaseAdapter,
  input: {
    userId: string;
    runId: string;
    inputs: CloudAgentInputResponse[];
    leaseSeconds?: number;
  },
): Promise<ClaimedCloudAgentInputCheckpoint> {
  const inputs = z
    .array(
      z.object({
        toolCallId: z.string().min(1).max(256),
        inputResponses: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1)
    .max(32)
    .parse(input.inputs);
  const leaseSeconds = Math.min(86_400, Math.max(60, Math.trunc(input.leaseSeconds ?? 900)));

  return db.transaction(async (tx) => {
    const rows = await tx.query<CloudAgentApprovalCheckpointRow>(
      `select * from public.cloud_agent_approval_checkpoints
        where run_id = $1 and user_id = $2 and checkpoint_kind = 'input' and state = 'pending'
          and created_at > now() - make_interval(hours => $3)
        order by version desc
        limit 1
        for update`,
      [input.runId, input.userId, APPROVAL_CHECKPOINT_TTL_HOURS],
    );
    if (!rows[0]) {
      const expiredRows = await tx.query<{ id: string }>(
        `select id from public.cloud_agent_approval_checkpoints
          where run_id = $1 and user_id = $2 and checkpoint_kind = 'input' and state = 'pending'
          limit 1`,
        [input.runId, input.userId],
      );
      if (expiredRows[0]) throw new CloudAgentApprovalCheckpointExpiredError();
    }
    const checkpoint = requireInputCheckpoint(rows);
    const pendingIds = new Set(checkpoint.pendingToolCalls.map((call) => call.id));
    const inputIds = new Set(inputs.map((entry) => entry.toolCallId));
    const exactMatch =
      inputIds.size === inputs.length &&
      inputIds.size === pendingIds.size &&
      [...inputIds].every((id) => pendingIds.has(id));
    if (!exactMatch) throw new CloudAgentInputResponseError();

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
    const claimed = requireInputCheckpoint(
      claimedRows,
      new CloudAgentApprovalCheckpointConflictError(),
    );
    const resumedRuns = await tx.query<CloudAgentRunRow>(
      `update public.cloud_agent_runs
          set state = 'running', completed_at = null, updated_at = now()
        where id = $1 and user_id = $2
          and state in ('queued', 'running', 'awaiting_input', 'paused')
        returning *`,
      [input.runId, input.userId],
    );
    if (!resumedRuns[0]) {
      throw new CloudAgentApprovalCheckpointConflictError('Cloud agent run is no longer resumable');
    }
    if (!claimed.leaseToken) throw new CloudAgentApprovalCheckpointConflictError();
    const resumptions: CloudAgentInputResumption[] = inputs.map((entry) => {
      const stored = claimed.requestState[entry.toolCallId];
      return {
        toolCallId: entry.toolCallId,
        inputResponses: entry.inputResponses,
        ...(stored?.requestState ? { requestState: stored.requestState } : {}),
        round: (stored?.round ?? 0) + 1,
      };
    });
    return { checkpoint: claimed, resumptions, leaseToken: claimed.leaseToken };
  });
}

// The lease lifecycle is kind-agnostic: an input checkpoint completes and
// releases through the same versioned lease machinery as an approval one.
export function completeCloudAgentInputCheckpoint(
  db: DatabaseAdapter,
  input: {
    userId: string;
    checkpointId: string;
    leaseToken: string;
    outcome?: 'resolved' | 'failed';
  },
): Promise<CloudAgentApprovalCheckpoint> {
  return completeCloudAgentApprovalCheckpoint(db, input);
}

export function releaseCloudAgentInputCheckpoint(
  db: DatabaseAdapter,
  input: { userId: string; runId: string; checkpointId: string; leaseToken: string },
): Promise<CloudAgentApprovalCheckpoint> {
  return releaseCloudAgentApprovalCheckpoint(db, input);
}

export function isCloudAgentRunTerminal(state: AgentTaskState): boolean {
  return TERMINAL_STATES.has(state);
}
