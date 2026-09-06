import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { CloudCodeAgentStep, CloudCodeSession, ProviderMessage } from '@agiworkforce/types';
import { SLOT_REGISTRY, normalizeModelId } from '@agiworkforce/types';
import { CLOUD_CODE_TURN_BUDGET_MS, FUNCTION_TEARDOWN_RESERVE_MS } from '@/lib/deadline-policy';
import { getE2BExecutor } from '@/lib/e2b/runtime';
import { managedCloudCodeSessionScope } from '@/lib/e2b/session-store';
import { logger } from '@/lib/logger';
import { buildServerProviderAdapter, resolveProviderFromModel } from './provider-adapter-service';
import {
  finalizeManagedUsageRequest,
  fingerprintManagedUsageRequest,
  markManagedUsageProviderStarted,
  reserveManagedUsageProviderStep,
  reserveManagedUsageRequest,
  type ManagedUsageRequestReservation,
} from './managed-usage-request-service';
import { selectHarnessRunner } from '@/lib/e2b/harnesses';
import { createCloudCodeToolRunner } from './cloud-code-agent-runner';
import { createHarnessStepProjector, runCloudCodeHarnessTurn } from './cloud-code-harness-turn';
import {
  createObservedProviderUsage,
  observedProviderUsageLedgerCents,
} from './managed-usage-accounting-service';
import {
  CLOUD_CODE_AGENT_MAX_STEPS,
  runCloudCodeAgentTurn,
  type CloudCodeAgentEvent,
  type CloudCodeAgentResult,
  type CloudCodeTurnUsage,
} from './cloud-code-agent-loop';
import {
  CloudCodeConflictError,
  type CloudCodeOwner,
  CloudCodeUnavailableError,
  agentStepLabel,
  claimCloudCodeSessionForRun,
  getCloudCodeSession,
  releaseCloudCodeSessionAfterRun,
} from './cloud-code-session-service';

const ESTIMATED_TURN_COST_CENTS = 25;

const MINIMUM_BILLED_TURN_CENTS = 1;

const UNKNOWN_TOOL_NAME = 'unknown';

const MAX_STEP_OUTPUT_LENGTH = 100_000;

/**
 * The wall-clock ceiling the platform enforces on the two routes that reach this
 * service: `export const maxDuration = 300` in
 * `app/api/code/sessions/[sessionId]/agent/route.ts` and in that route's
 * `approvals/route.ts`. Next.js needs `maxDuration` to be a literal, so it
 * cannot import this, the three values are kept in step by hand.
 */
const CLOUD_CODE_ROUTE_FUNCTION_LIMIT_MS = 300_000;

/**
 * What an agent turn is actually allowed to spend, and why it is not
 * {@link CLOUD_CODE_TURN_BUDGET_MS}.
 *
 * `cloud-code-agent-loop.ts` defaults to that 600 s standalone budget, which is
 * twice the platform ceiling above. Under that default the loop's own `timeout`
 * guard is unreachable dead code: the function is killed at 300 s, and a
 * platform kill runs no `finally`, no `catch`, nothing. The turn row is left at
 * `state = 'running'` with a null `stop_reason`, the managed-usage reservation
 * is never finalised, and the E2B sandbox is never paused or disposed, it just
 * keeps costing money until something else reaps it.
 *
 * The ceiling is the one budget we do not control, so the loop budget moves
 * under it and keeps the same teardown reserve the chat tool loop keeps for its
 * own unwind (settle the reservation, write the terminal turn row, pause the
 * sandbox). The loop now reaches its `timeout` return with time to spare, which
 * is what makes every line of that unwind path run at all.
 */
export const CLOUD_CODE_AGENT_TURN_BUDGET_MS = Math.min(
  CLOUD_CODE_TURN_BUDGET_MS,
  CLOUD_CODE_ROUTE_FUNCTION_LIMIT_MS - FUNCTION_TEARDOWN_RESERVE_MS,
);

interface TurnDeadline {
  /** The signal handed to the loop: aborts on client disconnect OR on budget. */
  signal: AbortSignal;
  /** True once the budget, rather than the client, caused the abort. */
  expired: () => boolean;
  dispose: () => void;
}

/**
 * The loop only consults its own budget between steps, so a provider stream or a
 * sandbox command that hangs sails straight past it and into the platform kill.
 * Compose the request signal with a budget timer so the in-flight call is
 * aborted too, and remember which of the two fired so a budget abort is not
 * mislabelled as a client cancellation.
 */
function withTurnDeadline(requestSignal: AbortSignal, budgetMs: number): TurnDeadline {
  const controller = new AbortController();
  let expired = false;

  const onRequestAbort = () => controller.abort(requestSignal.reason);
  if (requestSignal.aborted) onRequestAbort();
  else requestSignal.addEventListener('abort', onRequestAbort, { once: true });

  const timer = setTimeout(() => {
    expired = true;
    controller.abort(new Error('Managed Code agent turn exceeded its time budget'));
  }, budgetMs);
  // A pending timer must not be what keeps the invocation alive. `unref` is a
  // Node-only method the DOM `setTimeout` typing does not carry.
  (timer as unknown as { unref?: () => void }).unref?.();

  return {
    signal: controller.signal,
    expired: () => expired,
    dispose: () => {
      clearTimeout(timer);
      requestSignal.removeEventListener('abort', onRequestAbort);
    },
  };
}

/**
 * Give the sandbox back, whatever happened to the turn.
 *
 * `pause()` used to run un-guarded ahead of `dispose()`, so a pause that threw
 * skipped disposal entirely and leaked the sandbox. Neither failure is worth
 * turning a finished turn into a 500 either, so both are logged and swallowed.
 */
async function releaseSandbox(
  executor: { pause?: () => Promise<unknown> | unknown; dispose: () => Promise<unknown> | unknown },
  context: { turnId: string; sessionId: string },
): Promise<void> {
  try {
    await executor.pause?.();
  } catch (error) {
    logger.error({ error, ...context }, 'Could not pause the Managed Code sandbox; disposing it');
  }
  try {
    await executor.dispose();
  } catch (error) {
    logger.error({ error, ...context }, 'Could not dispose the Managed Code sandbox');
  }
}

/**
 * Move a turn row off `running`. Never throws: every caller is already unwinding
 * something else, and a failure here must not mask the original error or skip
 * the settlement that follows it.
 */
async function markTurnFailed(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  turnId: string,
  errorMessage: string,
  stopReason: 'error' | 'timeout',
): Promise<void> {
  try {
    await db.query(
      `update cloud_code_agent_turns
          set state = 'failed', stop_reason = $4, error_message = $2, updated_at = now()
        where id = $1 and user_id = $3`,
      [turnId, errorMessage.slice(0, 2000), owner.userId, stopReason],
    );
  } catch (error) {
    logger.error({ error, turnId, userId: owner.userId }, 'Could not record a failed Code turn');
  }
}

/**
 * Settle the reservation on a failure path. Never throws, for the same reason
 * {@link markTurnFailed} does not: an unsettled reservation is a bug worth
 * logging, not a reason to abandon the rest of the unwind.
 */
async function settleReservationQuietly(
  reservation: ManagedUsageRequestReservation,
  settlement: {
    outcome: 'completed' | 'failed';
    actualCostCents: number;
    usage?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await finalizeManagedUsageRequest({ ...reservation, ...settlement });
  } catch (error) {
    logger.error(
      { error, userId: reservation.userId },
      'Could not settle the Managed Code turn reservation',
    );
  }
}

function settledTurnCostCents(provider: string, model: string, usage: CloudCodeTurnUsage): number {
  const reportedTokens =
    usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const reportedCostDollars = usage.providerCostDollars ?? 0;
  if (reportedTokens <= 0 && reportedCostDollars <= 0) return ESTIMATED_TURN_COST_CENTS;

  const costCents = observedProviderUsageLedgerCents(usage, { provider, model });
  return costCents > 0 ? Math.max(MINIMUM_BILLED_TURN_CENTS, costCents) : ESTIMATED_TURN_COST_CENTS;
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

export interface CloudCodeAgentTurnOutcome {
  turnId: string;
  stopReason: CloudCodeAgentResult['stopReason'];
  stepsUsed: number;
  finalMessage: string;
  /** Every tool this turn ran, in order, so the transcript can show the work. */
  steps: CloudCodeAgentStep[];
  pendingApproval?: CloudCodeAgentResult['pendingApproval'];
  errorMessage?: string;
}

/**
 * Map a loop stop reason onto one of the five `cloud_code_agent_turns.state`
 * values.
 *
 * `timeout`, `max_steps` and `denied` used to fall through a `default` arm that
 * returned `completed`, so a turn the clock cut off was persisted as
 * `state = 'completed', stop_reason = 'timeout'`, a contradiction, and one that
 * made an abandoned turn indistinguishable from a finished one to every query
 * that filters on `state`. None of the three reached a conclusion, and the
 * schema has no "incomplete" state, so `failed` is the honest answer.
 *
 * There is deliberately no `default`: a stop reason added later must be mapped
 * here, and the unreachable trailing return is `failed`, never `completed`.
 */
function turnStateFor(stopReason: CloudCodeAgentResult['stopReason']): string {
  switch (stopReason) {
    case 'done':
      return 'completed';
    case 'awaiting_approval':
      return 'awaiting_approval';
    case 'cancelled':
      return 'cancelled';
    case 'error':
    case 'timeout':
    case 'max_steps':
    case 'denied':
      return 'failed';
    default: {
      // Compile-time exhaustiveness: a stop reason added later must be mapped
      // above, and the runtime fallback is `failed`, never `completed`.
      const unmapped: never = stopReason;
      void unmapped;
      return 'failed';
    }
  }
}

/**
 * A turn that stopped short must say so in the row. The loop leaves
 * `errorMessage` unset for the non-`error` stop reasons, which would persist a
 * failed turn with a null explanation.
 */
function terminalErrorMessage(result: CloudCodeAgentResult): string | null {
  if (result.errorMessage) return result.errorMessage.slice(0, 2000);
  switch (result.stopReason) {
    case 'timeout':
      return 'Agent turn exceeded its time budget and was stopped.';
    case 'max_steps':
      return `Agent turn reached its ${CLOUD_CODE_AGENT_MAX_STEPS}-step limit before finishing.`;
    case 'denied':
      return 'Agent turn stopped: a required command was denied.';
    default:
      return null;
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
): Promise<CloudCodeAgentTurnOutcome> {
  const claimed = await claimCloudCodeSessionForRun(input.db, input.owner, input.sessionId);
  if (!claimed) {
    throw new CloudCodeConflictError('Code session is busy; wait and try again');
  }
  try {
    return await runClaimedAgentTurn(input);
  } finally {
    await releaseCloudCodeSessionAfterRun(
      input.db,
      input.owner,
      input.sessionId,
      claimed.leaseToken,
    );
  }
}

async function runClaimedAgentTurn(
  input: PersistedAgentTurnExecution,
): Promise<CloudCodeAgentTurnOutcome> {
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
    await markTurnFailed(
      db,
      owner,
      turnId,
      error instanceof Error ? error.message : 'Usage reservation failed',
      'error',
    );
    throw error;
  }

  // The ledger only extends a reservation that has entered `provider_started`,
  // and only settles a *completed* one from that state. Without this the first
  // step of every turn was rejected as an idempotency conflict and no turn could
  // ever be billed as delivered.
  try {
    await markManagedUsageProviderStarted(reservation);
  } catch (error) {
    await settleReservationQuietly(reservation, { outcome: 'failed', actualCostCents: 0 });
    await markTurnFailed(
      db,
      owner,
      turnId,
      error instanceof Error ? error.message : 'Usage reservation could not be started',
      'error',
    );
    throw error;
  }

  const scope = managedCloudCodeSessionScope(
    owner.userId,
    sessionId,
    session.networkAccess,
    planTier,
    session.runtimeId,
  );
  const executor = await getE2BExecutor(scope);
  if (!executor) {
    await settleReservationQuietly(reservation, { outcome: 'failed', actualCostCents: 0 });
    await markTurnFailed(
      db,
      owner,
      turnId,
      'Managed Code environment could not be attached',
      'error',
    );
    throw new CloudCodeUnavailableError('Managed Code environment could not be attached');
  }

  let result: CloudCodeAgentResult;
  let stepIndex = initialStepIndex;
  const deadline = withTurnDeadline(input.signal, CLOUD_CODE_AGENT_TURN_BUDGET_MS);
  const resumingOwnLoop = Boolean(input.preApproved ?? input.priorMessages);
  const harness = resumingOwnLoop ? null : selectHarnessRunner(session.runtimeId);

  const steps: CloudCodeAgentStep[] = [];

  const recordStep = async (event: CloudCodeAgentEvent): Promise<void> => {
    if (event.type !== 'tool-end') return;
    stepIndex += 1;
    const toolName = event.toolName ?? UNKNOWN_TOOL_NAME;
    steps.push({
      index: stepIndex,
      toolName,
      label: agentStepLabel(toolName, event.toolArgs),
      output: (event.output ?? '').slice(0, MAX_STEP_OUTPUT_LENGTH),
      isError: event.isError ?? false,
    });
    await db.query(
      `insert into cloud_code_agent_steps
         (turn_id, step_index, tool_name, tool_args, output, is_error, completed_at)
       values ($1, $2, $3, $4::jsonb, $5, $6, now())
       on conflict (turn_id, step_index) do nothing`,
      [
        turnId,
        stepIndex,
        toolName,
        JSON.stringify(event.toolArgs ?? {}),
        (event.output ?? '').slice(0, MAX_STEP_OUTPUT_LENGTH),
        event.isError ?? false,
      ],
    );
  };

  try {
    if (harness) {
      const projectStep = createHarnessStepProjector();
      result = await runCloudCodeHarnessTurn({
        runner: harness,
        executor,
        goal,
        workspacePath: session.workspacePath,
        provider,
        model,
        signal: deadline.signal,
        maxDurationMs: CLOUD_CODE_AGENT_TURN_BUDGET_MS,
        onEvent: async (event) => {
          const step = projectStep(event);
          if (step) await recordStep(step);
        },
      });
    } else {
      result = await runCloudCodeAgentTurn({
        adapter: buildServerProviderAdapter(provider),
        model,
        goal,
        runner: createCloudCodeToolRunner(executor, session.workspacePath),
        // The composed signal, not the raw request signal: the turn must abort on
        // its own budget as well as on a client disconnect, so the unwind below
        // runs inside the platform's window instead of being killed mid-turn.
        signal: deadline.signal,
        maxDurationMs: CLOUD_CODE_AGENT_TURN_BUDGET_MS,
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
        onEvent: recordStep,
      });
    }

    if (deadline.expired() && result.stopReason === 'cancelled') {
      // The loop saw our budget abort, not a client disconnect. Persisting that
      // as `cancelled` would blame the user for the clock.
      result = { ...result, stopReason: 'timeout' };
    }
  } catch (error) {
    if (!deadline.expired() || input.signal.aborted) {
      await settleReservationQuietly(reservation, { outcome: 'failed', actualCostCents: 0 });
      await markTurnFailed(
        db,
        owner,
        turnId,
        error instanceof Error ? error.message : 'Agent turn failed',
        'error',
      );
      throw error;
    }
    // A provider stream or sandbox command that hung past the budget: our own
    // abort surfaced as a throw. That is a timeout, not a 500, and it falls
    // through to the same terminal write and settlement as any other stop
    // reason. Usage is empty because nothing measurable came back, which settles
    // at the reservation estimate rather than forfeiting the spend.
    logger.warn(
      { turnId, sessionId, budgetMs: CLOUD_CODE_AGENT_TURN_BUDGET_MS },
      'Managed Code agent turn aborted on its own time budget',
    );
    result = {
      stopReason: 'timeout',
      stepsUsed: Math.max(0, stepIndex - initialStepIndex),
      usage: createObservedProviderUsage(),
      finalMessage: '',
      messages: [],
    };
  } finally {
    deadline.dispose();
    await releaseSandbox(executor, { turnId, sessionId });
  }

  const state = turnStateFor(result.stopReason);
  const cumulativeSteps = initialStepIndex + result.stepsUsed;

  // The terminal row and the settlement are two writes that must both happen.
  // The row used to be written first and un-guarded, so a failure there returned
  // before the reservation was ever finalised, the turn ended holding a live
  // reservation and nobody knew. Record the failure, settle regardless, and only
  // then answer for the row.
  let terminalRowWritten = true;
  try {
    await db.query(
      `update cloud_code_agent_turns
          set state = $2, steps_used = greatest(steps_used, $3), stop_reason = $4,
              final_message = $5, error_message = $6, updated_at = now()
        where id = $1 and user_id = $7`,
      [
        turnId,
        state,
        cumulativeSteps,
        result.stopReason === 'awaiting_approval' ? null : result.stopReason,
        result.finalMessage.slice(0, 100_000) || null,
        terminalErrorMessage(result),
        owner.userId,
      ],
    );
  } catch (error) {
    terminalRowWritten = false;
    logger.error(
      { error, turnId, userId: owner.userId },
      'Could not record the finished Code turn',
    );
  }

  let pendingApproval = result.pendingApproval;
  let approvalRecordingFailed = false;
  if (terminalRowWritten && pendingApproval) {
    const approvalRows = await db
      .query<{ step_index: number }>(
        `insert into cloud_code_agent_approvals
         (turn_id, step_index, command, reason, expires_at)
       select $1, coalesce(max(step_index), -1) + 1, $2, $3, now() + interval '30 minutes'
         from cloud_code_agent_approvals
        where turn_id = $1
       returning step_index`,
        [turnId, pendingApproval.command, pendingApproval.reason],
      )
      .catch((error) => {
        logger.error({ error, turnId }, 'Could not record the Code approval request');
        return [] as { step_index: number }[];
      });
    const allocated = approvalRows[0]?.step_index;
    if (allocated === undefined) {
      approvalRecordingFailed = true;
      await markTurnFailed(db, owner, turnId, 'Approval request could not be recorded', 'error');
    } else {
      pendingApproval = { ...pendingApproval, stepIndex: allocated };
    }
  }

  const settledAsFailure =
    result.stopReason === 'error' || approvalRecordingFailed || !terminalRowWritten;
  await settleReservationQuietly(reservation, {
    outcome: settledAsFailure ? 'failed' : 'completed',
    actualCostCents: settledAsFailure ? 0 : settledTurnCostCents(provider, model, result.usage),
    usage: { steps: cumulativeSteps, stopReason: result.stopReason },
  });

  if (!terminalRowWritten) {
    throw new CloudCodeUnavailableError('Agent turn finished but could not be recorded');
  }
  if (approvalRecordingFailed) {
    throw new CloudCodeUnavailableError('Approval request could not be recorded');
  }

  logger.info(
    { turnId, sessionId, stopReason: result.stopReason, steps: cumulativeSteps },
    'Cloud Code agent turn finished',
  );

  // The same explanation that went into the row, so a client that only reads the
  // response is not left with a bare `timeout` and no words.
  const errorMessage = terminalErrorMessage(result);

  return {
    turnId,
    stopReason: result.stopReason,
    stepsUsed: cumulativeSteps,
    finalMessage: result.finalMessage,
    steps,
    ...(pendingApproval ? { pendingApproval } : {}),
    ...(errorMessage ? { errorMessage } : {}),
  };
}

export async function startCloudCodeAgentTurn(
  input: StartCloudCodeAgentTurnInput,
): Promise<CloudCodeAgentTurnOutcome> {
  const { db, owner, sessionId, goal, model, planTier, idempotencyKey } = input;

  const session = await getCloudCodeSession(db, owner, sessionId);
  if (session.state === 'closed') {
    throw new CloudCodeConflictError('Closed Code sessions cannot run agent turns');
  }
  // `running` falls through on purpose: claimCloudCodeSessionForRun is what
  // adjudicates it, rejecting a live lease and reclaiming an expired one. A
  // pre-check that rejected every `running` session would leave a turn killed
  // mid-flight wedged forever, which is exactly what the lease exists to end.
  if (session.state !== 'ready' && session.state !== 'running') {
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
