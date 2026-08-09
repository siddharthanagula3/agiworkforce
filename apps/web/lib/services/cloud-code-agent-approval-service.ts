import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { ContentBlock, ProviderMessage } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { CLOUD_CODE_RUN_COMMAND_TOOL } from './cloud-code-agent-tools';
import { truncateToolOutput } from './cloud-code-agent-loop';
import {
  executePersistedAgentTurn,
  type CloudCodeAgentTurnRecord,
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

/**
 * The decision half of the Cloud Code approval boundary.
 *
 * `cloud-code-agent-service` writes a `cloud_code_agent_approvals` row as
 * 'pending' and parks the turn in `awaiting_approval`. Until this module existed
 * that was the end of the story: the table declared 'approved'/'rejected'/
 * 'expired' and a `decided_at`, and nothing in production ever wrote them, so a
 * suspended turn could never be answered and never finished. This file owns the
 * transitions out of 'pending' and the resume that follows.
 *
 * WHAT MAKES IT SAFE
 *  - **Ownership.** The session is re-read through the owner-scoped session
 *    query, and the turn is matched on `session_id` + owner, so a turn id from
 *    another tenant reads as not found rather than as a decidable approval.
 *  - **Exactly once.** The decision is a conditional UPDATE guarded on
 *    `state = 'pending'`. Two concurrent decisions cannot both match, so the
 *    losing one is rejected instead of resuming the turn a second time. The turn
 *    row is then claimed out of `awaiting_approval` with the same shape of
 *    guard.
 *  - **The command is read back, never echoed.** The command handed to the
 *    sandbox comes from the approval row, so what the user saw is what runs even
 *    if the caller sends a different string.
 *  - **Expiry is enforced, not decorative.** The decision UPDATE requires
 *    `expires_at > now()`, and a stale row is transitioned to 'expired' instead
 *    of being left pending forever.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CloudCodeApprovalDecision = 'approve' | 'reject';

/** A stale approval is gone for a reason the user can act on. */
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

/**
 * Sweep stale pending rows for one session.
 *
 * Runs on the read path because there is no scheduler for this table. A user who
 * opens the pending list is exactly the person who must not be shown an approval
 * that can no longer be granted, so the sweep happens before the read rather
 * than as a background job that may not exist.
 */
async function expireStaleApprovals(
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
        and a.expires_at <= now()`,
    [sessionId, owner.userId, owner.organizationId],
  );
}

/** Every approval still awaiting a decision in one Code session. */
export async function listCloudCodeAgentApprovals(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
): Promise<CloudCodeAgentApproval[]> {
  validateCloudCodeSessionId(sessionId);
  // Throws not-found for a session this owner cannot see, so the approval list
  // cannot be used to probe other tenants' sessions.
  await getCloudCodeSession(db, owner, sessionId);
  await expireStaleApprovals(db, owner, sessionId);

  const rows = await db.query<ApprovalRow>(
    `select a.turn_id, a.step_index, a.command, a.reason, a.expires_at, a.created_at, t.goal
       from cloud_code_agent_approvals a
       join cloud_code_agent_turns t on t.id = a.turn_id
      where t.session_id = $1
        and t.user_id = $2
        and t.organization_id is not distinct from $3
        and a.state = 'pending'
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

/**
 * Rebuild the transcript of a suspended turn from its persisted steps.
 *
 * The turn's in-memory message list died with the invocation that suspended it,
 * and 0082 stores steps rather than provider messages, so the transcript is
 * reconstructed as the tool_use/tool_result pairs those steps represent. Ids are
 * synthesized from the step index: they only have to pair an assistant call with
 * its result inside this one request, which is all a provider requires.
 *
 * Assistant prose between steps is not persisted and is therefore not restored.
 * The model gets the goal and the full tool history, which is what it needs to
 * continue; it does not get its own earlier commentary back.
 */
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

/**
 * Record a decision and resume the suspended turn exactly once.
 *
 * A rejection resumes too: the loop tells the model the user declined so it can
 * choose another approach. Silently dropping the turn on rejection would leave a
 * paid-for turn parked forever with no final message.
 */
export async function decideCloudCodeAgentApproval(
  input: DecideCloudCodeAgentApprovalInput,
): Promise<CloudCodeAgentTurnRecord> {
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
    throw new CloudCodeConflictError('This turn is not waiting for an approval');
  }
  if (!turn.model) {
    throw new CloudCodeUnavailableError('This turn has no recorded model and cannot be resumed');
  }

  // THE exactly-once gate. Only a row that is still 'pending' and still in date
  // can be moved, so a replayed request, a double-click, and a second reviewer
  // racing the first all collapse to one decision.
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

  // Claim the turn out of the suspended state before any sandbox work. The
  // approval UPDATE above already elected a single winner, so this can only fail
  // if the turn moved for some other reason — in which case the decision stands
  // but there is nothing left to resume.
  const claimed = await db.query<{ id: string }>(
    `update cloud_code_agent_turns
        set state = 'running', updated_at = now()
      where id = $1 and state = 'awaiting_approval'
      returning id`,
    [turnId],
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

  // The suspending call itself was never stored as a step, so it is appended
  // here from the approval row — the command the user actually saw.
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
    // Derived, not caller-supplied: the resume is one billable continuation of
    // this specific decision, so a retried HTTP call reuses the reservation
    // instead of opening a second one.
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
