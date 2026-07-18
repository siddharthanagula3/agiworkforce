import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { AgentEventEnvelopeSchema } from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope, AgentTaskState } from '@agiworkforce/types/protocol';

export type CloudAgentOriginSurface = 'web' | 'desktop' | 'mobile' | 'chrome' | 'vscode' | 'api';
export type CloudAgentWorkMode = 'chat' | 'agiwork' | 'research';

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

export interface CloudAgentRun {
  id: string;
  userId: string;
  requestId: string;
  conversationId: string | null;
  originSurface: CloudAgentOriginSurface;
  workMode: CloudAgentWorkMode;
  state: AgentTaskState;
  provider: string;
  model: string;
  lastEventSequence: number;
  cancellationRequestedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CloudAgentRunSnapshot {
  run: CloudAgentRun;
  events: AgentEventEnvelope[];
}

export class CloudAgentRunNotFoundError extends Error {
  constructor() {
    super('Cloud agent run not found');
    this.name = 'CloudAgentRunNotFoundError';
  }
}

function asOriginSurface(value: string): CloudAgentOriginSurface {
  if (
    value === 'web' ||
    value === 'desktop' ||
    value === 'mobile' ||
    value === 'chrome' ||
    value === 'vscode' ||
    value === 'api'
  ) {
    return value;
  }
  throw new Error(`Invalid Cloud agent origin surface: ${value}`);
}

function asWorkMode(value: string): CloudAgentWorkMode {
  if (value === 'chat' || value === 'agiwork' || value === 'research') return value;
  throw new Error(`Invalid Cloud agent work mode: ${value}`);
}

function asTaskState(value: string): AgentTaskState {
  if (
    value === 'queued' ||
    value === 'running' ||
    value === 'awaiting_input' ||
    value === 'ready_for_review' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled' ||
    value === 'paused' ||
    value === 'archived'
  ) {
    return value;
  }
  throw new Error(`Invalid Cloud agent task state: ${value}`);
}

function mapRun(row: CloudAgentRunRow): CloudAgentRun {
  return {
    id: row.id,
    userId: row.user_id,
    requestId: row.request_id,
    conversationId: row.conversation_id,
    originSurface: asOriginSurface(row.origin_surface),
    workMode: asWorkMode(row.work_mode),
    state: asTaskState(row.state),
    provider: row.provider,
    model: row.model,
    lastEventSequence: Number(row.last_event_sequence),
    cancellationRequestedAt: row.cancellation_requested_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireRun(rows: CloudAgentRunRow[]): CloudAgentRun {
  const row = rows[0];
  if (!row) throw new CloudAgentRunNotFoundError();
  return mapRun(row);
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
  const nextState = envelope.event.type === 'task-state-changed' ? envelope.event.state : undefined;

  return db.transaction(async (tx) => {
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
  });
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

export function isCloudAgentRunTerminal(state: AgentTaskState): boolean {
  return TERMINAL_STATES.has(state);
}
