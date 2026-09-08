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
  validateCloudCodeSessionId,
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
export const CLOUD_CODE_ROUTE_FUNCTION_LIMIT_MS = 300_000;

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

/**
 * How often a running turn asks whether it has been stopped.
 *
 * The stop arrives as a row written by a different request, so there is nothing
 * to wait on: the only way a turn in flight learns about it is by asking. Two
 * and a half seconds bounds how long a reader waits after pressing stop, and
 * bounds the cost at one indexed single-row read per interval per running turn.
 */
const CANCELLATION_POLL_INTERVAL_MS = 2_500;

interface TurnDeadline {
  /** The signal handed to the loop: aborts on client disconnect, budget OR stop. */
  signal: AbortSignal;
  /** True once the budget, rather than the client, caused the abort. */
  expired: () => boolean;
  /** True once the reader asked for this turn to stop. */
  cancelled: () => boolean;
  dispose: () => void;
}

/**
 * The loop only consults its own budget between steps, so a provider stream or a
 * sandbox command that hangs sails straight past it and into the platform kill.
 * Compose the request signal with a budget timer so the in-flight call is
 * aborted too, and remember which of the two fired so a budget abort is not
 * mislabelled as a client cancellation.
 */
function withTurnDeadline(
  requestSignal: AbortSignal,
  budgetMs: number,
  cancellation?: { isRequested: () => Promise<boolean> },
): TurnDeadline {
  const controller = new AbortController();
  let expired = false;
  let cancelled = false;

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

  // The loop reads `cancelled` synchronously between steps and before each tool
  // call, which is what stops new side effects. This poll is what also cuts
  // short work already in flight: a provider stream, or a coding agent CLI that
  // the loop cannot interrupt from between its own iterations.
  const poll = cancellation
    ? setInterval(() => {
        void cancellation
          .isRequested()
          .then((requested) => {
            if (!requested || cancelled) return;
            cancelled = true;
            controller.abort(new Error('Managed Code agent turn was stopped'));
          })
          .catch((error: unknown) => {
            logger.warn({ error }, 'Could not read the Managed Code turn cancellation request');
          });
      }, CANCELLATION_POLL_INTERVAL_MS)
    : null;
  (poll as unknown as { unref?: () => void } | null)?.unref?.();

  return {
    signal: controller.signal,
    expired: () => expired,
    cancelled: () => cancelled,
    dispose: () => {
      clearTimeout(timer);
      if (poll) clearInterval(poll);
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

const CANCELLABLE_TURN_STATES = ['running', 'awaiting_approval'];

export interface CloudCodeTurnCancellation {
  turnId: string;
  requestedAt: string;
}

/**
 * Whether a stop has been asked for. Read by the running turn itself, so it is
 * scoped by the turn id and the owner and touches one indexed row.
 */
export async function isCloudCodeTurnCancellationRequested(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  turnId: string,
): Promise<boolean> {
  const rows = await db.query<{ cancel_requested_at: string | Date | null }>(
    `select cancel_requested_at
       from cloud_code_agent_turns
      where id = $1 and user_id = $2 and organization_id is not distinct from $3
      limit 1`,
    [turnId, owner.userId, owner.organizationId],
  );
  return Boolean(rows[0]?.cancel_requested_at);
}

/**
 * Records the stop. It does not release the run lease: the invocation running
 * the turn still holds the sandbox, and taking the session from underneath it
 * would let a second run drive the same sandbox. That invocation releases the
 * lease when it notices, and a killed one lets the lease expire on its own.
 *
 * `coalesce` keeps the first request's timestamp, so pressing stop twice does
 * not move the moment the turn was asked to end.
 */
export async function requestCloudCodeTurnCancellation(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
  turnId?: string | null,
): Promise<CloudCodeTurnCancellation> {
  validateCloudCodeSessionId(sessionId);
  const rows = await db.query<{ id: string; cancel_requested_at: string | Date }>(
    `update cloud_code_agent_turns
        set cancel_requested_at = coalesce(cancel_requested_at, now()), updated_at = now()
      where session_id = $1
        and user_id = $2
        and organization_id is not distinct from $3
        and state = any($4::text[])
        and ($5::uuid is null or id = $5::uuid)
      returning id, cancel_requested_at`,
    [sessionId, owner.userId, owner.organizationId, CANCELLABLE_TURN_STATES, turnId ?? null],
  );
  const row = rows[0];
  if (!row) {
    throw new CloudCodeConflictError('No agent turn is running in this Code session');
  }
  return {
    turnId: row.id,
    requestedAt:
      row.cancel_requested_at instanceof Date
        ? row.cancel_requested_at.toISOString()
        : new Date(row.cancel_requested_at).toISOString(),
  };
}

/**
 * Re-sums the session from its turns rather than adding this turn's tokens to
 * a running total. A turn can be written more than once, by a retry or by an
 * approval resuming it, and an addition would count those twice. The aggregate
 * is over one session's turns on an indexed column and cannot drift.
 */
async function recordSessionContextUsage(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
): Promise<void> {
  await db.query(
    `update cloud_code_sessions
        set context_input_tokens = totals.input_tokens,
            context_output_tokens = totals.output_tokens,
            updated_at = now()
       from (
         select coalesce(sum(input_tokens), 0) as input_tokens,
                coalesce(sum(output_tokens), 0) as output_tokens
           from cloud_code_agent_turns
          where session_id = $1
            and user_id = $2
            and organization_id is not distinct from $3
       ) as totals
      where cloud_code_sessions.id = $1
        and cloud_code_sessions.user_id = $2
        and cloud_code_sessions.organization_id is not distinct from $3`,
    [sessionId, owner.userId, owner.organizationId],
  );
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
  /** Tokens this turn reported, summed from what each step's provider call returned. */
  inputTokens: number;
  outputTokens: number;
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
function terminalErrorMessage(result: CloudCodeAgentResult, stoppedByUser: boolean): string | null {
  if (result.errorMessage) return result.errorMessage.slice(0, 2000);
  switch (result.stopReason) {
    case 'timeout':
      return 'Agent turn exceeded its time budget and was stopped.';
    case 'max_steps':
      return `Agent turn reached its ${CLOUD_CODE_AGENT_MAX_STEPS}-step limit before finishing.`;
    case 'denied':
      return 'Agent turn stopped: a required command was denied.';
    case 'cancelled':
      // Both end as `cancelled`, and they are not the same event to a reader:
      // one they asked for, one happened to them.
      return stoppedByUser
        ? 'You stopped this turn. Nothing further was run.'
        : 'The connection to this turn dropped before it finished, so it stopped where it was.';
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
  const deadline = withTurnDeadline(input.signal, CLOUD_CODE_AGENT_TURN_BUDGET_MS, {
    isRequested: () => isCloudCodeTurnCancellationRequested(db, owner, turnId),
  });
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
        isCancelled: deadline.cancelled,
        onEvent: recordStep,
      });
    }

    if (deadline.cancelled()) {
      // The reader pressed stop. That outranks both the budget and a client
      // disconnect: whatever the loop reported, this turn ended because it was
      // asked to.
      result = { ...result, stopReason: 'cancelled' };
    } else if (deadline.expired() && result.stopReason === 'cancelled') {
      // The loop saw our budget abort, not a client disconnect. Persisting that
      // as `cancelled` would blame the user for the clock.
      result = { ...result, stopReason: 'timeout' };
    }
  } catch (error) {
    const abandoned = {
      stepsUsed: Math.max(0, stepIndex - initialStepIndex),
      usage: createObservedProviderUsage(),
      finalMessage: '',
      messages: [],
    };
    if (deadline.cancelled()) {
      // Our own abort, raised because the reader stopped the turn. The work
      // already done still settles; only the rest of it is abandoned.
      logger.info({ turnId, sessionId }, 'Managed Code agent turn stopped on request');
      result = { stopReason: 'cancelled', ...abandoned };
    } else if (deadline.expired() && !input.signal.aborted) {
      // A provider stream or sandbox command that hung past the budget: our own
      // abort surfaced as a throw. That is a timeout, not a 500, and it falls
      // through to the same terminal write and settlement as any other stop
      // reason. Usage is empty because nothing measurable came back, which
      // settles at the reservation estimate rather than forfeiting the spend.
      logger.warn(
        { turnId, sessionId, budgetMs: CLOUD_CODE_AGENT_TURN_BUDGET_MS },
        'Managed Code agent turn aborted on its own time budget',
      );
      result = { stopReason: 'timeout', ...abandoned };
    } else {
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
  } finally {
    deadline.dispose();
    await releaseSandbox(executor, { turnId, sessionId });
  }

  const state = turnStateFor(result.stopReason);
  const cumulativeSteps = initialStepIndex + result.stepsUsed;
  const stoppedByUser = deadline.cancelled();

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
              final_message = $5, error_message = $6,
              input_tokens = $8, output_tokens = $9, updated_at = now()
        where id = $1 and user_id = $7`,
      [
        turnId,
        state,
        cumulativeSteps,
        result.stopReason === 'awaiting_approval' ? null : result.stopReason,
        result.finalMessage.slice(0, 100_000) || null,
        terminalErrorMessage(result, stoppedByUser),
        owner.userId,
        result.usage.inputTokens,
        result.usage.outputTokens,
      ],
    );
    await recordSessionContextUsage(db, owner, sessionId);
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
  const errorMessage = terminalErrorMessage(result, stoppedByUser);

  return {
    turnId,
    stopReason: result.stopReason,
    stepsUsed: cumulativeSteps,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
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
  if (session.archivedAt) {
    throw new CloudCodeConflictError(
      'This Code session is archived. Unarchive it to run agent turns in this session.',
    );
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
