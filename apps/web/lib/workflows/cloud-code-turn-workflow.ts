import 'server-only';

import { z } from 'zod';

import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { executePersistedAgentTurn } from '@/lib/services/cloud-code-agent-service';
import { isCloudCodeDurableStopRequested } from '@/lib/services/cloud-code-durable-run';
import type { DrainedTurn } from '@/lib/services/cloud-code-agent-loop';
import { executeCloudAgentOperation } from './cloud-agent-operation-executor';
import {
  parseCloudCodeTurnWorkflowInput,
  type CloudCodeTurnWorkflowInput,
} from './cloud-code-turn-workflow-input';

/**
 * What a provider step is allowed to carry across an invocation boundary.
 *
 * Everything here is data. The stream the provider returned is drained before
 * it is recorded, so a replayed step returns the same text and tool calls
 * without a second provider call, which is the whole point of recording it.
 */
const DrainedTurnSchema = z
  .object({
    text: z.string(),
    toolCalls: z.array(
      z.object({
        type: z.literal('tool_use'),
        id: z.string(),
        name: z.string(),
        input: z.record(z.string(), z.unknown()),
      }),
    ),
    usage: z
      .object({
        inputTokens: z.number(),
        outputTokens: z.number(),
        cacheReadTokens: z.number(),
        cacheWriteTokens: z.number(),
        cacheWrite1hTokens: z.number(),
        reasoningTokens: z.number(),
      })
      .optional(),
    error: z.string().optional(),
  })
  .strict();

const ToolOutcomeSchema = z.object({ output: z.string(), isError: z.boolean() }).strict();

/**
 * One durable Code turn.
 *
 * The whole turn is one workflow step, and the per-call durability comes from
 * the operation ledger underneath it rather than from more steps: a retried
 * invocation replays this function, and every provider call and every workspace
 * tool call it already completed is answered from
 * `cloud_agent_execution_operations` instead of being performed again. That is
 * also what makes sandbox re-attachment deterministic without any bookkeeping:
 * a retry attaches by (user, session), the same address the first attempt used,
 * and only the calls that never completed are performed against it.
 */
export async function executeCloudCodeTurnInvocation(
  rawInput: CloudCodeTurnWorkflowInput,
): Promise<void> {
  'use step';

  const input = parseCloudCodeTurnWorkflowInput(rawInput);
  const db = getNeonDb();
  const owner = { userId: input.userId, organizationId: input.organizationId };
  const scopedDb = createClaimedUserScopedDb(db, owner);

  const operation = <TResult extends object>(
    operationKey: string,
    operationKind: 'provider' | 'tool',
    retrySafety: 'safe' | 'unsafe',
    payload: unknown,
    resultSchema: z.ZodType<TResult>,
    execute: () => Promise<TResult>,
  ): Promise<TResult> =>
    executeCloudAgentOperation<TResult>(db, {
      userId: input.userId,
      runId: input.runId,
      billingIdempotencyKey: input.idempotencyKey,
      operationKey,
      operationKind,
      retrySafety,
      payload,
      resultSchema,
      execute,
    });

  try {
    await executePersistedAgentTurn({
      db: scopedDb,
      owner,
      session: input.session,
      sessionId: input.sessionId,
      turnId: input.turnId,
      goal: input.goal,
      model: input.model,
      provider: input.provider,
      planTier: input.planTier,
      idempotencyKey: input.idempotencyKey,
      // A durable turn has no client connection to abort it. Stopping is a row,
      // and the loop reads it between steps and before each tool call.
      signal: new AbortController().signal,
      isCancellationRequested: () =>
        isCloudCodeDurableStopRequested(db, owner, {
          runId: input.runId,
          turnId: input.turnId,
        }),
      providerExecutor: (request) =>
        operation<DrainedTurn>(
          request.operationKey,
          'provider',
          'unsafe',
          { step: request.step, model: input.model },
          DrainedTurnSchema as unknown as z.ZodType<DrainedTurn>,
          request.execute,
        ),
      toolExecutor: (request) =>
        operation(
          request.operationKey,
          'tool',
          request.retrySafety,
          { step: request.step, toolName: request.toolName, args: request.args },
          ToolOutcomeSchema,
          request.execute,
        ),
    });
  } catch (error) {
    // executePersistedAgentTurn has already written the turn's terminal row and
    // settled its reservation on every path it controls. Rethrowing would ask
    // the platform to retry a turn that has already answered for itself.
    logger.error(
      { error, turnId: input.turnId, sessionId: input.sessionId, runId: input.runId },
      'Durable Code turn ended in an error it had already recorded',
    );
  }
}

export async function cloudCodeTurnWorkflow(rawInput: CloudCodeTurnWorkflowInput): Promise<void> {
  await executeCloudCodeTurnInvocation(rawInput);
}
