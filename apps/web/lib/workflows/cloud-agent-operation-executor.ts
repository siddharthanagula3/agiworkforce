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

const RAW_PAYLOAD_MESSAGE_PATTERN = /^\s*(?:\d{3}\s+)?[[{]/;
const RAW_PAYLOAD_EXECUTION_ERROR_MESSAGE =
  'The external operation returned a response AGI could not summarize.';

function messageOf(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : null;
}

function sanitizeExecutionError(error: unknown): unknown {
  const message = messageOf(error);
  if (message === null || !RAW_PAYLOAD_MESSAGE_PATTERN.test(message)) return error;
  return new Error(RAW_PAYLOAD_EXECUTION_ERROR_MESSAGE, { cause: error });
}

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
  } catch (rawError) {
    const error = sanitizeExecutionError(rawError);
    await failCloudAgentExecutionOperation(db, {
      userId: input.userId,
      operationId: claim.operationId,
      leaseToken: claim.leaseToken,
      error: executionError(error),
    });
    throw error;
  }

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
