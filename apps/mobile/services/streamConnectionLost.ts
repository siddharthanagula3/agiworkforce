import type { TurnFailureCode } from '@agiworkforce/types/protocol';
import type { StreamFailure } from '@/src/features/chat/utils/messageStreamError';
import { ApiHttpError } from './apiErrors';

export const STREAM_INTERRUPTED_FAILURE_CODE = 'stream_interrupted' satisfies TurnFailureCode;

export const CONNECTION_LOST_FAILURE: StreamFailure = {
  message: 'Connection lost.',
  code: STREAM_INTERRUPTED_FAILURE_CODE,
  retryable: true,
};

/**
 * The connection ended after the answer had begun and nothing durable names
 * the run, so sending the request again would either repeat text already shown
 * or be refused as a replay. The partial answer stands and the reader chooses
 * to continue it.
 */
export class StreamConnectionLostError extends Error {
  constructor() {
    super(CONNECTION_LOST_FAILURE.message);
    this.name = 'StreamConnectionLostError';
  }
}

const REPLAYED_IDEMPOTENCY_CODES: ReadonlySet<string> = new Set([
  'idempotency_in_progress',
  'idempotency_replay',
]);

export function isIdempotencyReplayRefusal(error: unknown): boolean {
  return (
    error instanceof ApiHttpError &&
    error.status === 409 &&
    error.code !== null &&
    REPLAYED_IDEMPOTENCY_CODES.has(error.code)
  );
}
