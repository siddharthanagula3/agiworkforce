import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { CloudCodeSession, ProviderMessage } from '@agiworkforce/types';
import { SLOT_REGISTRY, normalizeModelId } from '@agiworkforce/types';
import { getE2BExecutor } from '@/lib/e2b/runtime';
import { managedCloudCodeSessionScope } from '@/lib/e2b/session-store';
import { logger } from '@/lib/logger';
import { buildServerProviderAdapter, resolveProviderFromModel } from './provider-adapter-service';
import {
  finalizeManagedUsageRequest,
  fingerprintManagedUsageRequest,
  reserveManagedUsageProviderStep,
  reserveManagedUsageRequest,
  type ManagedUsageRequestReservation,
} from './managed-usage-request-service';
import { createCloudCodeToolRunner } from './cloud-code-agent-runner';
import { observedProviderUsageLedgerCents } from './managed-usage-accounting-service';
import {
  runCloudCodeAgentTurn,
  type CloudCodeAgentEvent,
  type CloudCodeAgentResult,
  type CloudCodeTurnUsage,
} from './cloud-code-agent-loop';
import {
  CloudCodeConflictError,
  CloudCodeUnavailableError,
  getCloudCodeSession,
  type CloudCodeOwner,
} from './cloud-code-session-service';

const ESTIMATED_TURN_COST_CENTS = 25;

const MINIMUM_BILLED_TURN_CENTS = 1;

function settledTurnCostCents(provider: string, model: string, usage: CloudCodeTurnUsage): number {
  const reportedTokens =
    usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  if (reportedTokens <= 0) return ESTIMATED_TURN_COST_CENTS;

  const costCents = observedProviderUsageLedgerCents(usage, { provider, model });
  return Math.max(MINIMUM_BILLED_TURN_CENTS, costCents);
}

const FLAGSHIP_MODEL_IDS: ReadonlySet<string> = new Set(
  Object.values(SLOT_REGISTRY)
    .filter((definition) => definition.slot.startsWith('flagship_'))
    .map((definition) => definition.modelId),
);

function isFlagshipModel(model: string): boolean {
  return FLAGSHIP_MODEL_IDS.has(normalizeModelId(model) ?? model);
}

export interface StartCloudCodeAgentTurnInput {
  db: DatabaseAdapter;
  owner: CloudCodeOwner;
  sessionId: string;
  goal: string;
  model: string;
  planTier: string;
  idempotencyKey: string;
  signal: AbortSignal;
}

export interface CloudCodeAgentTurnRecord {
  turnId: string;
  stopReason: CloudCodeAgentResult['stopReason'];
  stepsUsed: number;
  finalMessage: string;
  pendingApproval?: CloudCodeAgentResult['pendingApproval'];
  errorMessage?: string;
}

function turnStateFor(stopReason: CloudCodeAgentResult['stopReason']): string {
  switch (stopReason) {
    case 'done':
      return 'completed';
    case 'awaiting_approval':
      return 'awaiting_approval';
    case 'cancelled':
      return 'cancelled';
    case 'error':
      return 'failed';
    default:
      return 'completed';
  }
}

export interface PersistedAgentTurnExecution {
  db: DatabaseAdapter;
  owner: CloudCodeOwner;
  session: CloudCodeSession;
  sessionId: string;
  turnId: string;
  goal: string;
  model: string;
  provider: string;
  planTier: string;
  idempotencyKey: string;
  signal: AbortSignal;
  priorMessages?: ProviderMessage[];
  preApproved?: { toolUseId: string; command: string; approved: boolean };
  initialStepIndex?: number;
}

export async function executePersistedAgentTurn(
  input: PersistedAgentTurnExecution,
): Promise<CloudCodeAgentTurnRecord> {
  const { db, owner, session, sessionId, turnId, goal, model, provider, planTier, idempotencyKey } =
    input;
  const isFlagship = isFlagshipModel(model);
  const initialStepIndex = input.initialStepIndex ?? 0;

  let reservation: ManagedUsageRequestReservation;
  try {
    reservation = await reserveManagedUsageRequest({
      db,
      userId: owner.userId,
      idempotencyKey,
      requestHash: fingerprintManagedUsageRequest({ sessionId, goal, model, turnId }),
      provider,
      model,
      estimatedCostCents: ESTIMATED_TURN_COST_CENTS,
      planTier,
      isFlagship,
    });
  } catch (error) {
    await db.query(
      `update cloud_code_agent_turns set state = 'failed', error_message = $2, updated_at = now()
        where id = $1`,
      [turnId, error instanceof Error ? error.message.slice(0, 2000) : 'Usage reservation failed'],
    );
    throw error;
  }

  const scope = managedCloudCodeSessionScope(
    owner.userId,
    sessionId,
    session.networkAccess,
    planTier,
  );
  const executor = await getE2BExecutor(scope);
  if (!executor) {
    await finalizeManagedUsageRequest({ ...reservation, outcome: 'failed', actualCostCents: 0 });
    await db.query(
      `update cloud_code_agent_turns set state = 'failed', error_message = $2, updated_at = now()
        where id = $1`,
      [turnId, 'Managed Code environment could not be attached'],
    );
    throw new CloudCodeUnavailableError('Managed Code environment could not be attached');
  }

  let result: CloudCodeAgentResult | undefined;
  let stepIndex = initialStepIndex;

  try {
    result = await runCloudCodeAgentTurn({
      adapter: buildServerProviderAdapter(provider),
      model,
      goal,
      runner: createCloudCodeToolRunner(executor, session.workspacePath),
      signal: input.signal,
      repositoryUrl: session.repositoryUrl,
      workspacePath: session.workspacePath,
      ...(input.priorMessages ? { priorMessages: input.priorMessages } : {}),
      ...(input.preApproved ? { preApproved: input.preApproved } : {}),
      onStepCommitted: async (step: number) => {
        await reserveManagedUsageProviderStep({
          reservation,
          operationKey: `provider:${step + 1}`,
          estimatedCostCents: ESTIMATED_TURN_COST_CENTS,
          planTier,
          isFlagship,
        });
      },
      onEvent: async (event: CloudCodeAgentEvent) => {
        if (event.type !== 'tool-end') return;
        stepIndex += 1;
        await db.query(
          `insert into cloud_code_agent_steps
             (turn_id, step_index, tool_name, tool_args, output, is_error, completed_at)
           values ($1, $2, $3, $4::jsonb, $5, $6, now())
           on conflict (turn_id, step_index) do nothing`,
          [
            turnId,
            stepIndex,
            event.toolName ?? 'unknown',
            JSON.stringify(event.toolArgs ?? {}),
            (event.output ?? '').slice(0, 100_000),
            event.isError ?? false,
          ],
        );
      },
    });
  } catch (error) {
    await finalizeManagedUsageRequest({ ...reservation, outcome: 'failed', actualCostCents: 0 });
    await db.query(
      `update cloud_code_agent_turns set state = 'failed', error_message = $2, updated_at = now()
        where id = $1`,
      [turnId, error instanceof Error ? error.message.slice(0, 2000) : 'Agent turn failed'],
    );
    throw error;
  } finally {
    await executor.pause?.();
    await executor.dispose();
  }

  const state = turnStateFor(result.stopReason);
  const cumulativeSteps = initialStepIndex + result.stepsUsed;

  await db.query(
    `update cloud_code_agent_turns
        set state = $2, steps_used = greatest(steps_used, $3), stop_reason = $4,
            final_message = $5, error_message = $6, updated_at = now()
      where id = $1`,
    [
      turnId,
      state,
      cumulativeSteps,
      result.stopReason === 'awaiting_approval' ? null : result.stopReason,
      result.finalMessage.slice(0, 100_000) || null,
      result.errorMessage?.slice(0, 2000) ?? null,
    ],
  );

  let pendingApproval = result.pendingApproval;
  if (pendingApproval) {
    const approvalRows = await db.query<{ step_index: number }>(
      `insert into cloud_code_agent_approvals
         (turn_id, step_index, command, reason, expires_at)
       select $1, coalesce(max(step_index), -1) + 1, $2, $3, now() + interval '30 minutes'
         from cloud_code_agent_approvals
        where turn_id = $1
       returning step_index`,
      [turnId, pendingApproval.command, pendingApproval.reason],
    );
    const allocated = approvalRows[0]?.step_index;
    if (allocated === undefined) {
      await db.query(
        `update cloud_code_agent_turns
            set state = 'failed', stop_reason = 'error', error_message = $2, updated_at = now()
          where id = $1`,
        [turnId, 'Approval request could not be recorded'],
      );
      await finalizeManagedUsageRequest({
        ...reservation,
        outcome: 'failed',
        actualCostCents: 0,
      });
      throw new CloudCodeUnavailableError('Approval request could not be recorded');
    }
    pendingApproval = { ...pendingApproval, stepIndex: allocated };
  }

  await finalizeManagedUsageRequest({
    ...reservation,
    outcome: result.stopReason === 'error' ? 'failed' : 'completed',
    actualCostCents:
      result.stopReason === 'error' ? 0 : settledTurnCostCents(provider, model, result.usage),
    usage: { steps: cumulativeSteps, stopReason: result.stopReason },
  });

  logger.info(
    { turnId, sessionId, stopReason: result.stopReason, steps: cumulativeSteps },
    'Cloud Code agent turn finished',
  );

  return {
    turnId,
    stopReason: result.stopReason,
    stepsUsed: cumulativeSteps,
    finalMessage: result.finalMessage,
    ...(pendingApproval ? { pendingApproval } : {}),
    ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
  };
}

export async function startCloudCodeAgentTurn(
  input: StartCloudCodeAgentTurnInput,
): Promise<CloudCodeAgentTurnRecord> {
  const { db, owner, sessionId, goal, model, planTier, idempotencyKey } = input;

  const session = await getCloudCodeSession(db, owner, sessionId);
  if (session.state === 'closed') {
    throw new CloudCodeConflictError('Closed Code sessions cannot run agent turns');
  }
  if (session.state !== 'ready') {
    throw new CloudCodeConflictError('Code session is busy; wait and try again');
  }

  const provider = resolveProviderFromModel(model);

  const turnRows = await db.query<{ id: string }>(
    `insert into cloud_code_agent_turns
       (session_id, user_id, organization_id, goal, idempotency_key, model, provider, state)
     values ($1, $2, $3, $4, $5, $6, $7, 'running')
     on conflict (user_id, idempotency_key) do update set updated_at = now()
     returning id`,
    [sessionId, owner.userId, owner.organizationId, goal, idempotencyKey, model, provider],
  );
  const turnId = turnRows[0]?.id;
  if (!turnId) throw new CloudCodeUnavailableError('Could not open an agent turn');

  return executePersistedAgentTurn({
    db,
    owner,
    session,
    sessionId,
    turnId,
    goal,
    model,
    provider,
    planTier,
    idempotencyKey,
    signal: input.signal,
  });
}
