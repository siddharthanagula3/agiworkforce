import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { ContentBlock, ProviderMessage } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { withSpan } from '@/lib/observability/span';
import { CLOUD_CODE_RUN_COMMAND_TOOL } from './cloud-code-agent-tools';
import { truncateToolOutput } from './cloud-code-agent-loop';
import {
  executePersistedAgentTurn,
  type CloudCodeAgentTurnOutcome,
} from './cloud-code-agent-service';
import { resolveProviderFromModel } from './provider-adapter-service';
import {
  CloudCodeConflictError,
  CloudCodeNotFoundError,
  CloudCodeUnavailableError,
  getCloudCodeSession,
  validateCloudCodeSessionId,
  type CloudCodeOwner,
} from './cloud-code-session-service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CloudCodeApprovalDecision = 'approve' | 'reject';

export class CloudCodeApprovalExpiredError extends Error {
  constructor(message = 'This approval request expired and can no longer be decided') {
    super(message);
    this.name = 'CloudCodeApprovalExpiredError';
  }
}

export interface CloudCodeAgentApproval {
  turnId: string;
  stepIndex: number;
  command: string;
  reason: string;
  goal: string;
  expiresAt: string;
  createdAt: string;
}

interface ApprovalRow {
  turn_id: string;
  step_index: number;
  command: string;
  reason: string;
  goal: string;
  expires_at: string | Date;
  created_at: string | Date;
}

interface TurnRow {
  id: string;
  goal: string;
  model: string | null;
  provider: string | null;
  state: string;
}

interface StepRow {
  step_index: number;
  tool_name: string;
  tool_args: unknown;
  output: string | null;
  is_error: boolean;
}

function isoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function requireTurnId(turnId: unknown): string {
  if (typeof turnId !== 'string' || !UUID_RE.test(turnId)) throw new CloudCodeNotFoundError();
  return turnId;
}

async function retireUndecidableApprovals(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
): Promise<void> {
  await db.query(
    `update cloud_code_agent_approvals a
        set state = 'expired', decided_at = now()
       from cloud_code_agent_turns t
      where a.turn_id = t.id
        and t.session_id = $1
        and t.user_id = $2
        and t.organization_id is not distinct from $3
        and a.state = 'pending'
        and (a.expires_at <= now() or t.state <> 'awaiting_approval')`,
    [sessionId, owner.userId, owner.organizationId],
  );
}

export async function listCloudCodeAgentApprovals(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
): Promise<CloudCodeAgentApproval[]> {
  validateCloudCodeSessionId(sessionId);
  await getCloudCodeSession(db, owner, sessionId);
  await retireUndecidableApprovals(db, owner, sessionId);

  const rows = await db.query<ApprovalRow>(
    `select a.turn_id, a.step_index, a.command, a.reason, a.expires_at, a.created_at, t.goal
       from cloud_code_agent_approvals a
       join cloud_code_agent_turns t on t.id = a.turn_id
      where t.session_id = $1
        and t.user_id = $2
        and t.organization_id is not distinct from $3
        and a.state = 'pending'
        and t.state = 'awaiting_approval'
      order by a.created_at asc
      limit 50`,
    [sessionId, owner.userId, owner.organizationId],
  );

  return rows.map((row) => ({
    turnId: row.turn_id,
    stepIndex: row.step_index,
    command: row.command,
    reason: row.reason,
    goal: row.goal,
    expiresAt: isoString(row.expires_at),
    createdAt: isoString(row.created_at),
  }));
}

function rebuildTurnMessages(goal: string, steps: StepRow[]): ProviderMessage[] {
  const messages: ProviderMessage[] = [{ role: 'user', content: goal }];
  for (const step of steps) {
    const toolUseId = `step-${step.step_index}`;
    const input =
      step.tool_args && typeof step.tool_args === 'object' && !Array.isArray(step.tool_args)
        ? (step.tool_args as Record<string, unknown>)
        : {};
    messages.push({
      role: 'assistant',
      content: [{ type: 'tool_use', id: toolUseId, name: step.tool_name, input }],
    });
    const result: ContentBlock = {
      type: 'tool_result',
      toolUseId,
      content: truncateToolOutput(step.output ?? ''),
      isError: step.is_error,
    };
    messages.push({ role: 'user', content: [result] });
  }
  return messages;
}

export interface DecideCloudCodeAgentApprovalInput {
  db: DatabaseAdapter;
  owner: CloudCodeOwner;
  sessionId: string;
  turnId: string;
  stepIndex: number;
  decision: CloudCodeApprovalDecision;
  planTier: string;
  signal: AbortSignal;
}

export function decideCloudCodeAgentApproval(
  input: DecideCloudCodeAgentApprovalInput,
): Promise<CloudCodeAgentTurnOutcome> {
  return withSpan(
    'approval.decide',
    {
      domain: 'approval',
      attributes: {
        'approval.decision': input.decision,
        'approval.step_index': input.stepIndex,
      },
    },
    () => resolveCloudCodeAgentApproval(input),
  );
}

async function resolveCloudCodeAgentApproval(
  input: DecideCloudCodeAgentApprovalInput,
): Promise<CloudCodeAgentTurnOutcome> {
  const { db, owner, sessionId, decision, planTier } = input;
  const turnId = requireTurnId(input.turnId);
  if (!Number.isInteger(input.stepIndex) || input.stepIndex < 0) {
    throw new CloudCodeNotFoundError();
  }
  const stepIndex = input.stepIndex;

  validateCloudCodeSessionId(sessionId);
  const session = await getCloudCodeSession(db, owner, sessionId);
  if (session.state === 'closed') {
    throw new CloudCodeConflictError('Closed Code sessions cannot resume agent turns');
  }
  if (session.state !== 'ready') {
    throw new CloudCodeConflictError('Code session is busy; wait and try again');
  }

  const turnRows = await db.query<TurnRow>(
    `select id, goal, model, provider, state
       from cloud_code_agent_turns
      where id = $1
        and session_id = $2
        and user_id = $3
        and organization_id is not distinct from $4
      limit 1`,
    [turnId, sessionId, owner.userId, owner.organizationId],
  );
  const turn = turnRows[0];
  if (!turn) throw new CloudCodeNotFoundError();
  if (turn.state !== 'awaiting_approval') {
    await db.query(
      `update cloud_code_agent_approvals
          set state = 'expired', decided_at = now()
        where turn_id = $1 and step_index = $2 and state = 'pending'`,
      [turnId, stepIndex],
    );
    throw new CloudCodeConflictError('This turn is not waiting for an approval');
  }
  if (!turn.model) {
    throw new CloudCodeUnavailableError('This turn has no recorded model and cannot be resumed');
  }

  const decided = await db.query<{ command: string }>(
    `update cloud_code_agent_approvals
        set state = $3, decided_at = now()
      where turn_id = $1
        and step_index = $2
        and state = 'pending'
        and expires_at > now()
      returning command`,
    [turnId, stepIndex, decision === 'approve' ? 'approved' : 'rejected'],
  );
  const approvedCommand = decided[0]?.command;
  if (!approvedCommand) {
    const existing = await db.query<{ state: string; is_expired: boolean }>(
      `select state, expires_at <= now() as is_expired
         from cloud_code_agent_approvals
        where turn_id = $1 and step_index = $2
        limit 1`,
      [turnId, stepIndex],
    );
    const row = existing[0];
    if (!row) throw new CloudCodeNotFoundError();
    if (row.state === 'pending' && row.is_expired) {
      await db.query(
        `update cloud_code_agent_approvals
            set state = 'expired', decided_at = now()
          where turn_id = $1 and step_index = $2 and state = 'pending'`,
        [turnId, stepIndex],
      );
      throw new CloudCodeApprovalExpiredError();
    }
    if (row.state === 'expired') throw new CloudCodeApprovalExpiredError();
    throw new CloudCodeConflictError('This approval has already been decided');
  }

  const claimed = await db.query<{ id: string }>(
    `update cloud_code_agent_turns
        set state = 'running', updated_at = now()
      where id = $1
        and state = 'awaiting_approval'
        and user_id = $2
        and organization_id is not distinct from $3
      returning id`,
    [turnId, owner.userId, owner.organizationId],
  );
  if (!claimed[0]) {
    throw new CloudCodeConflictError('This turn is no longer waiting for an approval');
  }

  const stepRows = await db.query<StepRow>(
    `select step_index, tool_name, tool_args, output, is_error
       from cloud_code_agent_steps
      where turn_id = $1
      order by step_index asc`,
    [turnId],
  );
  const initialStepIndex = stepRows.reduce((max, step) => Math.max(max, step.step_index), 0);
  const messages = rebuildTurnMessages(turn.goal, stepRows);

  const approvalToolUseId = `approval-${stepIndex}`;
  messages.push({
    role: 'assistant',
    content: [
      {
        type: 'tool_use',
        id: approvalToolUseId,
        name: CLOUD_CODE_RUN_COMMAND_TOOL,
        input: { command: approvedCommand },
      },
    ],
  });

  logger.info(
    { turnId, sessionId, stepIndex, decision },
    'Cloud Code approval decided; resuming turn',
  );

  return executePersistedAgentTurn({
    db,
    owner,
    session,
    sessionId,
    turnId,
    goal: turn.goal,
    model: turn.model,
    provider: turn.provider ?? resolveProviderFromModel(turn.model),
    planTier,
    idempotencyKey: `cc-resume:${turnId}:${stepIndex}`,
    signal: input.signal,
    priorMessages: messages,
    preApproved: {
      toolUseId: approvalToolUseId,
      command: approvedCommand,
      approved: decision === 'approve',
    },
    initialStepIndex,
  });
}
