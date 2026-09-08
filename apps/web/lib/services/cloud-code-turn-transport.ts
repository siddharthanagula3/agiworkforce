import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import {
  areDurableCodeTurnsEnabled,
  startCloudCodeTurnWorkflow,
} from '@/lib/workflows/start-cloud-code-turn-workflow';
import {
  CLOUD_CODE_AGENT_TURN_BUDGET_MS,
  executePersistedAgentTurn,
  prepareCloudCodeAgentTurn,
  type CloudCodeAgentTurnOutcome,
  type PreparedCloudCodeAgentTurn,
  type StartCloudCodeAgentTurnInput,
} from './cloud-code-agent-service';
import { openCloudCodeDurableRun } from './cloud-code-durable-run';
import { listCloudCodeAgentTurns, type CloudCodeOwner } from './cloud-code-session-service';

const DURABLE_TURN_POLL_INTERVAL_MS = 1_500;

/**
 * Raised when the request that started a durable turn ends before the turn
 * does. The turn is not lost, which is the entire point of the durable
 * transport: it is running in another invocation and the transcript shows it
 * when the session is read again.
 */
export class CloudCodeTurnStillRunningError extends Error {
  constructor() {
    super('This turn is still running. It will appear in the transcript when it finishes.');
    this.name = 'CloudCodeTurnStillRunningError';
  }
}

/**
 * Hands the turn to the durable runner, and says whether it took it.
 *
 * The run row is opened first and only then is the workflow started, because
 * the workflow records every provider and tool call against that run: starting
 * without one would produce a turn whose steps have nowhere to go. A refusal for
 * any reason leaves the turn untouched for the inline path, which is why this
 * answers with a boolean rather than throwing.
 */
async function handOffToDurableRunner(
  input: StartCloudCodeAgentTurnInput,
  prepared: PreparedCloudCodeAgentTurn,
): Promise<boolean> {
  if (!areDurableCodeTurnsEnabled()) return false;
  try {
    const { runId } = await openCloudCodeDurableRun(input.db, input.owner, {
      turnId: prepared.turnId,
      idempotencyKey: input.idempotencyKey,
      provider: prepared.provider,
      model: input.model,
    });
    const started = await startCloudCodeTurnWorkflow({
      userId: input.owner.userId,
      organizationId: input.owner.organizationId,
      runId,
      sessionId: input.sessionId,
      turnId: prepared.turnId,
      goal: input.goal,
      model: input.model,
      provider: prepared.provider,
      planTier: input.planTier,
      idempotencyKey: input.idempotencyKey,
      session: {
        workspacePath: prepared.session.workspacePath,
        networkAccess: prepared.session.networkAccess,
        runtimeId: prepared.session.runtimeId,
        repositoryUrl: prepared.session.repositoryUrl,
        extraHosts: prepared.session.extraHosts,
      },
    });
    return started.transport === 'durable';
  } catch (error) {
    logger.warn(
      { error, turnId: prepared.turnId, sessionId: input.sessionId },
      'Could not hand a Code turn to the durable runner; running it request-scoped',
    );
    return false;
  }
}

/**
 * Waits for a turn another invocation is running.
 *
 * The request keeps the answer shape it always had, so nothing on the surface
 * changes when a turn goes durable. What changes is what happens when this
 * request dies: the turn does not.
 */
async function awaitDurableTurn(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
  turnId: string,
  signal: AbortSignal,
): Promise<CloudCodeAgentTurnOutcome> {
  const deadlineAtMs = Date.now() + CLOUD_CODE_AGENT_TURN_BUDGET_MS;
  while (Date.now() < deadlineAtMs && !signal.aborted) {
    const turns = await listCloudCodeAgentTurns(db, owner, sessionId);
    const turn = turns.find((candidate) => candidate.turnId === turnId);
    if (turn?.stopReason && turn.stopReason !== 'awaiting_approval') {
      return {
        turnId,
        stopReason: turn.stopReason,
        stepsUsed: turn.stepsUsed,
        inputTokens: turn.inputTokens,
        outputTokens: turn.outputTokens,
        finalMessage: turn.finalMessage,
        steps: turn.steps,
        ...(turn.errorMessage ? { errorMessage: turn.errorMessage } : {}),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, DURABLE_TURN_POLL_INTERVAL_MS));
  }
  throw new CloudCodeTurnStillRunningError();
}

/**
 * The single entry a Code agent turn passes through.
 *
 * Which transport carries it is decided here and nowhere else, so the turn
 * service stays unaware that a durable one exists and the workflow stays
 * unaware that an inline one does. Every gate the entry point runs has already
 * run by the time this is called: a transport is a choice about where work
 * happens, never about what is allowed.
 */
export async function runCloudCodeTurn(
  input: StartCloudCodeAgentTurnInput,
): Promise<CloudCodeAgentTurnOutcome> {
  const prepared = await prepareCloudCodeAgentTurn(input);
  const durable = await handOffToDurableRunner(input, prepared);
  if (durable) {
    return awaitDurableTurn(input.db, input.owner, input.sessionId, prepared.turnId, input.signal);
  }

  return executePersistedAgentTurn({
    db: input.db,
    owner: input.owner,
    session: prepared.session,
    sessionId: input.sessionId,
    turnId: prepared.turnId,
    goal: input.goal,
    model: input.model,
    provider: prepared.provider,
    planTier: input.planTier,
    idempotencyKey: input.idempotencyKey,
    signal: input.signal,
  });
}
