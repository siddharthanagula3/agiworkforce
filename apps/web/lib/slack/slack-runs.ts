import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  ManagedCloudScheduleRunApprovalToolCallSchema,
  type ManagedCloudScheduleRunApproval,
  type ManagedCloudScheduleRunApprovalToolCall,
} from '@agiworkforce/cloud-contracts';
import { TERMINAL_AGENT_TASK_STATES } from '@agiworkforce/types';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { transitionCloudAgentRun } from '@/lib/services/cloud-agent-run-service';
import type {
  ScheduledRunApproval,
  ScheduledRunApprovalCheckpoint,
} from '@/lib/services/schedule-service';

import { SLACK_APPROVAL_TTL_HOURS } from './slack-config';
import type { SlackAssistantSurface } from './slack-events';

export type SlackRunMode = 'answer' | 'task';

export interface SlackRun {
  id: string;
  userId: string;
  organizationId: string | null;
  installationId: string;
  slackUserId: string;
  channelId: string;
  messageTs: string;
  threadTs: string | null;
  surface: SlackAssistantSurface;
  mode: SlackRunMode;
  agentRunId: string | null;
}

export interface SlackPendingApproval {
  runId: string;
  teamName: string;
  surface: SlackAssistantSurface;
  agentRunId: string | null;
  requestedAt: string;
  expiresAt: string;
  toolCalls: ManagedCloudScheduleRunApprovalToolCall[];
}

export interface ParkedSlackTask {
  userId: string;
  agentRunId: string;
}

export class SlackRunApprovalError extends Error {
  constructor(
    message: string,
    readonly reason: 'not_found' | 'not_waiting' | 'expired' | 'stale' | 'stopped',
  ) {
    super(message);
    this.name = 'SlackRunApprovalError';
  }
}

interface RunRow {
  id: string;
  user_id: string;
  organization_id: string | null;
  installation_id: string;
  slack_user_id: string;
  channel_id: string;
  message_ts: string;
  thread_ts: string | null;
  surface: SlackAssistantSurface;
  mode: SlackRunMode;
  agent_run_id: string | null;
}

const RUN_COLUMNS =
  'id, user_id, organization_id, installation_id, slack_user_id, channel_id, message_ts, thread_ts, surface, mode, agent_run_id';

export const SLACK_TASK_STOPPED_ERROR = 'task_stopped: the task was stopped in AGI Workforce';

function taskStoppedSql(terminalStatesParam: string): string {
  return `(
    run.mode = 'task'
    and (
      run.agent_run_id is null
      or exists (
        select 1
          from cloud_agent_runs as task
         where task.id = run.agent_run_id
           and task.user_id = run.user_id
           and task.organization_id is not distinct from run.organization_id
           and (
             task.cancellation_requested_at is not null
             or task.state = any(${terminalStatesParam}::text[])
           )
      )
    )
  )`;
}

const TERMINAL_TASK_STATES: string[] = [...TERMINAL_AGENT_TASK_STATES];

const ApprovalRequestSchema = z.object({
  requestedAt: z.string(),
  toolCalls: z.array(ManagedCloudScheduleRunApprovalToolCallSchema).min(1),
});

function mapRun(row: RunRow): SlackRun {
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    installationId: row.installation_id,
    slackUserId: row.slack_user_id,
    channelId: row.channel_id,
    messageTs: row.message_ts,
    threadTs: row.thread_ts,
    surface: row.surface,
    mode: row.mode,
    agentRunId: row.agent_run_id,
  };
}

export function parkedSlackTasks(
  rows: readonly { user_id: string | null; agent_run_id: string | null }[],
): ParkedSlackTask[] {
  return rows.flatMap((row) =>
    row.user_id && row.agent_run_id ? [{ userId: row.user_id, agentRunId: row.agent_run_id }] : [],
  );
}

export async function stopParkedSlackTasks(
  db: DatabaseAdapter,
  tasks: readonly ParkedSlackTask[],
  state: 'cancelled' | 'timed_out',
): Promise<void> {
  await Promise.all(
    tasks.map((task) =>
      transitionCloudAgentRun(db, { userId: task.userId, runId: task.agentRunId, state }).catch(
        (error: unknown) => {
          logger.error(
            { error, runId: task.agentRunId },
            'A Slack task waiting for approval was not stopped',
          );
        },
      ),
    ),
  );
}

function toIso(value: string | Date): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function checkpointOf(value: unknown): ScheduledRunApprovalCheckpoint | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const checkpoint = value as Partial<ScheduledRunApprovalCheckpoint>;
  if (
    typeof checkpoint.sessionId !== 'string' ||
    typeof checkpoint.turnId !== 'string' ||
    typeof checkpoint.nextEventSequence !== 'number' ||
    typeof checkpoint.completedSteps !== 'number' ||
    !Array.isArray(checkpoint.messages) ||
    !Array.isArray(checkpoint.pendingToolCalls) ||
    checkpoint.pendingToolCalls.length === 0 ||
    !checkpoint.route ||
    typeof checkpoint.route.modelKey !== 'string'
  ) {
    return null;
  }
  return checkpoint as ScheduledRunApprovalCheckpoint;
}

export async function startSlackRun(
  scopedDb: DatabaseAdapter,
  input: Omit<SlackRun, 'id' | 'agentRunId'> & { eventId: string },
): Promise<SlackRun | null> {
  const [row] = await scopedDb.query<RunRow>(
    `insert into slack_assistant_runs (
       user_id, organization_id, installation_id, event_id, slack_user_id, channel_id,
       message_ts, thread_ts, surface, mode
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (installation_id, event_id) do nothing
     returning ${RUN_COLUMNS}`,
    [
      input.userId,
      input.organizationId,
      input.installationId,
      input.eventId,
      input.slackUserId,
      input.channelId,
      input.messageTs,
      input.threadTs,
      input.surface,
      input.mode,
    ],
  );
  return row ? mapRun(row) : null;
}

export async function settleSlackRun(
  scopedDb: DatabaseAdapter,
  run: Pick<SlackRun, 'id' | 'userId'>,
  outcome: {
    status: 'completed' | 'failed' | 'cancelled';
    model?: string | null;
    error?: string | null;
  },
): Promise<void> {
  await scopedDb.execute(
    `update slack_assistant_runs
        set status = $3,
            model = coalesce($4, model),
            error = $5,
            completed_at = now(),
            approval_checkpoint = null,
            approval_request = null,
            approval_expires_at = null
      where id = $1 and user_id = $2 and status = 'running'`,
    [
      run.id,
      run.userId,
      outcome.status,
      outcome.model ?? null,
      outcome.error?.slice(0, 2_000) ?? null,
    ],
  );
}

export async function parkSlackRunForApproval(
  scopedDb: DatabaseAdapter,
  run: Pick<SlackRun, 'id' | 'userId'>,
  input: { approval: ScheduledRunApproval; model: string },
): Promise<string | null> {
  const [row] = await scopedDb.query<{ approval_expires_at: string | Date }>(
    `update slack_assistant_runs
        set status = 'awaiting_approval',
            model = $3,
            approval_checkpoint = $4::jsonb,
            approval_request = $5::jsonb,
            approval_expires_at = now() + make_interval(hours => $6)
      where id = $1 and user_id = $2 and status = 'running'
      returning approval_expires_at`,
    [
      run.id,
      run.userId,
      input.model,
      JSON.stringify(input.approval.checkpoint),
      JSON.stringify({
        requestedAt: new Date().toISOString(),
        toolCalls: input.approval.toolCalls,
      }),
      SLACK_APPROVAL_TTL_HOURS,
    ],
  );
  return row ? toIso(row.approval_expires_at) : null;
}

async function cancelStoppedSlackTasks(scopedDb: DatabaseAdapter, userId: string): Promise<void> {
  await scopedDb.execute(
    `update slack_assistant_runs as run
        set status = 'cancelled',
            error = $3,
            approval_checkpoint = null,
            approval_request = null,
            approval_expires_at = null,
            completed_at = now()
      where run.user_id = $1
        and run.status = 'awaiting_approval'
        and ${taskStoppedSql('$2')}`,
    [userId, TERMINAL_TASK_STATES, SLACK_TASK_STOPPED_ERROR],
  );
}

export async function listPendingSlackApprovals(
  scopedDb: DatabaseAdapter,
  userId: string,
): Promise<SlackPendingApproval[]> {
  const expired = await scopedDb.query<{ user_id: string; agent_run_id: string | null }>(
    `update slack_assistant_runs
        set status = 'expired',
            approval_checkpoint = null,
            approval_request = null,
            completed_at = now()
      where user_id = $1
        and status = 'awaiting_approval'
        and approval_expires_at <= now()
      returning user_id, agent_run_id`,
    [userId],
  );
  await stopParkedSlackTasks(scopedDb, parkedSlackTasks(expired), 'timed_out');
  await cancelStoppedSlackTasks(scopedDb, userId);
  const rows = await scopedDb.query<{
    id: string;
    team_name: string;
    surface: SlackAssistantSurface;
    agent_run_id: string | null;
    approval_request: unknown;
    approval_expires_at: string | Date;
  }>(
    `select run.id, installation.team_name, run.surface, run.agent_run_id, run.approval_request,
            run.approval_expires_at
       from slack_assistant_runs as run
       join slack_installations as installation on installation.id = run.installation_id
      where run.user_id = $1
        and run.status = 'awaiting_approval'
      order by run.created_at desc
      limit 50`,
    [userId],
  );
  return rows.flatMap((row) => {
    const request = ApprovalRequestSchema.safeParse(row.approval_request);
    if (!request.success) return [];
    return [
      {
        runId: row.id,
        teamName: row.team_name,
        surface: row.surface,
        agentRunId: row.agent_run_id,
        requestedAt: request.data.requestedAt,
        expiresAt: toIso(row.approval_expires_at),
        toolCalls: request.data.toolCalls,
      },
    ];
  });
}

export async function claimSlackRunApproval(
  scopedDb: DatabaseAdapter,
  input: { userId: string; runId: string; approval: ManagedCloudScheduleRunApproval },
): Promise<{ run: SlackRun; checkpoint: ScheduledRunApprovalCheckpoint }> {
  const claimed = await scopedDb.transaction(async (tx) => {
    const [row] = await tx.query<
      RunRow & {
        status: string;
        approval_checkpoint: unknown;
        approval_expires_at: string | Date | null;
        task_stopped: boolean;
      }
    >(
      `select ${RUN_COLUMNS}, status, approval_checkpoint, approval_expires_at,
              ${taskStoppedSql('$3')} as task_stopped
         from slack_assistant_runs as run
        where id = $1 and user_id = $2
        for update`,
      [input.runId, input.userId, TERMINAL_TASK_STATES],
    );
    if (!row) throw new SlackRunApprovalError('This request was not found', 'not_found');
    if (row.status !== 'awaiting_approval') {
      throw new SlackRunApprovalError('This request is not waiting for approval', 'not_waiting');
    }
    if (row.task_stopped) return null;
    if (!row.approval_expires_at || new Date(row.approval_expires_at) <= new Date()) {
      throw new SlackRunApprovalError(
        'This approval expired. Ask again in Slack to start over.',
        'expired',
      );
    }
    const checkpoint = checkpointOf(row.approval_checkpoint);
    if (!checkpoint) {
      throw new SlackRunApprovalError('This request can no longer be resumed', 'stale');
    }
    const pending = checkpoint.pendingToolCalls.map((call) => call.id).sort();
    const decided = [...new Set(input.approval.toolCallIds)].sort();
    if (pending.length !== decided.length || pending.some((id, index) => id !== decided[index])) {
      throw new SlackRunApprovalError(
        'The step waiting for approval has changed. Reload it and decide again.',
        'stale',
      );
    }
    await tx.execute(
      `update slack_assistant_runs
          set status = 'running',
              approval_checkpoint = null,
              approval_request = null,
              approval_expires_at = null
        where id = $1 and user_id = $2 and status = 'awaiting_approval'`,
      [input.runId, input.userId],
    );
    return { run: mapRun(row), checkpoint };
  });
  if (claimed) return claimed;
  await cancelStoppedSlackTasks(scopedDb, input.userId);
  throw new SlackRunApprovalError(
    'This task was stopped in AGI Workforce, so it cannot continue.',
    'stopped',
  );
}
