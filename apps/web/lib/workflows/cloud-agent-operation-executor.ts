import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { ZodType } from 'zod';
import { FatalError, RetryableError } from 'workflow';

import {
  claimCloudAgentExecutionOperation,
  completeCloudAgentExecutionOperation,
  failCloudAgentExecutionOperation,
  fingerprintCloudAgentOperation,
  type CloudAgentOperationKind,
  type CloudAgentRetrySafety,
} from '@/lib/services/cloud-agent-execution-service';

function executionError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return {
    name: 'UnknownExecutionError',
    message: typeof error === 'string' ? error : 'The external operation failed.',
  };
}

function recordedFailureMessage(error: Record<string, unknown> | null): string {
  const message = error?.['message'];
  return typeof message === 'string' && message.trim().length > 0
    ? message
    : 'The durable external operation previously failed.';
}

/**
 * Execute one provider or tool call behind a durable receipt. A completed
 * receipt is replayed, while an expired unsafe call is never repeated because
 * its external side effect cannot be proven absent.
 */
export async function executeCloudAgentOperation<TResult extends object>(
  db: DatabaseAdapter,
  input: {
    userId: string;
    runId: string;
    billingIdempotencyKey: string;
    operationKey: string;
    operationKind: CloudAgentOperationKind;
    retrySafety: CloudAgentRetrySafety;
    payload: unknown;
    resultSchema: ZodType<TResult>;
    execute: () => Promise<TResult>;
    usage?: (result: TResult) => Record<string, unknown>;
  },
): Promise<TResult> {
  const inputHash = fingerprintCloudAgentOperation({
    operationKind: input.operationKind,
    operationKey: input.operationKey,
    payload: input.payload,
  });
  const claim = await claimCloudAgentExecutionOperation(db, {
    userId: input.userId,
    runId: input.runId,
    operationKey: input.operationKey,
    operationKind: input.operationKind,
    inputHash,
    retrySafety: input.retrySafety,
  });

  switch (claim.disposition) {
    case 'completed':
      return input.resultSchema.parse(claim.result);
    case 'failed':
      throw new FatalError(recordedFailureMessage(claim.error));
    case 'in_progress':
      throw new RetryableError('Another workflow step is still executing this operation.', {
        retryAfter: '65s',
      });
    case 'outcome_unknown':
      throw new FatalError(
        'The external operation outcome could not be verified, so AGI did not repeat it.',
      );
    case 'acquired':
      break;
  }

  let result: TResult;
  try {
    result = input.resultSchema.parse(await input.execute());
  } catch (error) {
    await failCloudAgentExecutionOperation(db, {
      userId: input.userId,
      operationId: claim.operationId,
      leaseToken: claim.leaseToken,
      error: executionError(error),
    });
    throw error;
  }

  // Deliberately do not mark the operation failed when receipt persistence
  // fails here. The external call already succeeded; leaving the lease active
  // makes an unsafe retry become outcome_unknown instead of duplicating it.
  await completeCloudAgentExecutionOperation(db, {
    userId: input.userId,
    operationId: claim.operationId,
    leaseToken: claim.leaseToken,
    result: result as Record<string, unknown>,
    usage: {
      billingIdempotencyKey: input.billingIdempotencyKey,
      ...(input.usage?.(result) ?? {}),
    },
  });
  return result;
}
