import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { ZodType } from 'zod';
import { FatalError, RetryableError } from 'workflow';

import { logger } from '@/lib/logger';
import {
  claimCloudAgentExecutionOperation,
  completeCloudAgentExecutionOperation,
  failCloudAgentExecutionOperation,
  fingerprintCloudAgentOperation,
  renewCloudAgentExecutionOperationLease,
  OPERATION_LEASE_RENEWAL_INTERVAL_SECONDS,
  OPERATION_REPLAY_LIMIT_CODE,
  type CloudAgentOperationKind,
  type CloudAgentRetrySafety,
} from '@/lib/services/cloud-agent-execution-service';

const MILLISECONDS_PER_SECOND = 1000;
const RAW_PAYLOAD_MESSAGE_PATTERN = /^\s*(?:\d{3}\s+)?[[{]/;
const RAW_PAYLOAD_EXECUTION_ERROR_MESSAGE =
  'The external operation returned a response AGI could not summarize.';

function messageOf(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : null;
}

// The fields classifyError reads, kept through sanitisation and the durable receipt so a replay rotates the same way.
function classificationFields(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== 'object') return {};
  const source = error as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    type?: unknown;
    retryAfterSeconds?: unknown;
  };
  const status =
    typeof source.status === 'number'
      ? source.status
      : typeof source.statusCode === 'number'
        ? source.statusCode
        : undefined;
  return {
    ...(status !== undefined ? { status } : {}),
    ...(typeof source.code === 'string' ? { code: source.code } : {}),
    ...(typeof source.type === 'string' ? { type: source.type } : {}),
    ...(typeof source.retryAfterSeconds === 'number'
      ? { retryAfterSeconds: source.retryAfterSeconds }
      : {}),
  };
}

function sanitizeExecutionError(error: unknown): unknown {
  const message = messageOf(error);
  if (message === null || !RAW_PAYLOAD_MESSAGE_PATTERN.test(message)) return error;
  return Object.assign(
    new Error(RAW_PAYLOAD_EXECUTION_ERROR_MESSAGE, { cause: error }),
    classificationFields(error),
  );
}

function executionError(error: unknown): Record<string, unknown> {
  const named =
    error instanceof Error
      ? { name: error.name, message: error.message }
      : {
          name: 'UnknownExecutionError',
          message: typeof error === 'string' ? error : 'The external operation failed.',
        };
  return { ...named, ...classificationFields(error) };
}

function recordedFailureMessage(error: Record<string, unknown> | null): string {
  const message = error?.['message'];
  return typeof message === 'string' && message.trim().length > 0
    ? message
    : 'The durable external operation previously failed.';
}

// A recorded provider failure replays as the same classified failure; the replay cap stays fatal because it is the platform's verdict, not a provider's.
function recordedFailure(
  operationKind: CloudAgentOperationKind,
  record: Record<string, unknown> | null,
): Error {
  const message = recordedFailureMessage(record);
  if (operationKind !== 'provider' || !record || record['code'] === OPERATION_REPLAY_LIMIT_CODE) {
    return new FatalError(message);
  }
  const replayed = new Error(message);
  if (typeof record['name'] === 'string' && record['name'].length > 0) {
    replayed.name = record['name'];
  }
  return Object.assign(replayed, classificationFields(record));
}

async function withLeaseHeartbeat<TResult>(
  renew: () => Promise<boolean>,
  run: () => Promise<TResult>,
): Promise<TResult> {
  const timer = setInterval(() => {
    void renew()
      .then((renewed) => {
        if (!renewed) {
          logger.warn('Cloud agent operation lease renewal found the lease no longer held');
        }
      })
      .catch((error: unknown) => {
        logger.error({ error }, 'Cloud agent operation lease renewal failed');
      });
  }, OPERATION_LEASE_RENEWAL_INTERVAL_SECONDS * MILLISECONDS_PER_SECOND);
  try {
    return await run();
  } finally {
    clearInterval(timer);
  }
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
      throw recordedFailure(input.operationKind, claim.error);
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
    result = input.resultSchema.parse(
      await withLeaseHeartbeat(
        () =>
          renewCloudAgentExecutionOperationLease(db, {
            userId: input.userId,
            operationId: claim.operationId,
            leaseToken: claim.leaseToken,
          }),
        input.execute,
      ),
    );
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
