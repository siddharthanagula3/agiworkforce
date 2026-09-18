import { secureTokenHex } from '@/lib/secure-random';

/**
 * Four ids, each answering a different question. `requestId` is what a user
 * quotes in a support ticket, `operationId` is the one logical call the system
 * tried to make, `attemptId` is one try of it, and `parentTaskId` is the piece
 * of work the request belongs to when it is not the whole of it.
 *
 * The distinction that matters: a provider retry keeps the operation and gets a
 * new attempt. Without that, a retried call looks like two calls in every log
 * and every cost row, which is the shape of a duplicate-charge bug.
 */
export interface OperationIdentity {
  readonly requestId: string;
  readonly operationId: string;
  readonly attemptId: string;
  readonly attempt: number;
  readonly parentTaskId?: string;
}

export const REQUEST_ID_PREFIX = 'req';
export const OPERATION_ID_PREFIX = 'op';
export const ATTEMPT_ID_PREFIX = 'att';
export const TASK_ID_PREFIX = 'task';

const ID_PATTERN = /^[a-z]{2,6}_[0-9a-f]{16,32}$/u;

function mint(prefix: string, bytes: number): string {
  return `${prefix}_${secureTokenHex(bytes)}`;
}

export function newRequestId(): string {
  return mint(REQUEST_ID_PREFIX, 12);
}

export function newOperationId(): string {
  return mint(OPERATION_ID_PREFIX, 12);
}

export function newAttemptId(): string {
  return mint(ATTEMPT_ID_PREFIX, 8);
}

export function newTaskId(): string {
  return mint(TASK_ID_PREFIX, 12);
}

export function isMintedId(value: string): boolean {
  return ID_PATTERN.test(value);
}

export function beginOperation(input: {
  requestId: string;
  operationId?: string;
  parentTaskId?: string;
}): OperationIdentity {
  return {
    requestId: input.requestId,
    operationId: input.operationId ?? newOperationId(),
    attemptId: newAttemptId(),
    attempt: 1,
    ...(input.parentTaskId === undefined ? {} : { parentTaskId: input.parentTaskId }),
  };
}

/** A retry of the same logical call: the operation is kept, the attempt is not. */
export function nextAttempt(identity: OperationIdentity): OperationIdentity {
  return { ...identity, attemptId: newAttemptId(), attempt: identity.attempt + 1 };
}

export interface OperationLogFields {
  request_id: string;
  operation_id: string;
  attempt_id: string;
  attempt: number;
  parent_task_id?: string;
}

/**
 * Ids only. Nothing here is derived from message content, tool output or
 * credentials, so a log line built from these fields cannot leak either.
 */
export function operationLogFields(identity: OperationIdentity): OperationLogFields {
  return {
    request_id: identity.requestId,
    operation_id: identity.operationId,
    attempt_id: identity.attemptId,
    attempt: identity.attempt,
    ...(identity.parentTaskId === undefined ? {} : { parent_task_id: identity.parentTaskId }),
  };
}

export const OPERATION_CARRIER_KEY = 'operation';

export interface OperationCarrier {
  readonly [OPERATION_CARRIER_KEY]: OperationIdentity;
}

/**
 * A tool call, a queued job and a sandbox run all outlive the stack frame that
 * started them, so the identity travels in the payload they read back.
 */
export function withOperationCarrier<T extends Record<string, unknown>>(
  payload: T,
  identity: OperationIdentity,
): T & OperationCarrier {
  return { ...payload, [OPERATION_CARRIER_KEY]: identity } as T & OperationCarrier;
}

export function carriedOperation(payload: unknown): OperationIdentity | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const raw = (payload as Record<string, unknown>)[OPERATION_CARRIER_KEY];
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Partial<OperationIdentity>;
  if (typeof candidate.requestId !== 'string') return null;
  if (typeof candidate.operationId !== 'string') return null;
  if (typeof candidate.attemptId !== 'string') return null;
  if (typeof candidate.attempt !== 'number' || !Number.isInteger(candidate.attempt)) return null;
  if (candidate.parentTaskId !== undefined && typeof candidate.parentTaskId !== 'string') {
    return null;
  }
  return candidate as OperationIdentity;
}

export const OPERATION_REPLAY_REF_VERSION = 1;

export interface OperationReplayRef {
  readonly version: number;
  readonly requestId: string;
  readonly operationId: string;
  readonly attemptId: string;
}

/**
 * The smallest thing a reporter can paste that names one attempt exactly. It
 * carries no payload, so it is safe in a bug report and in a log line.
 */
export function formatOperationReplayRef(identity: OperationIdentity): string {
  return [
    OPERATION_REPLAY_REF_VERSION,
    identity.requestId,
    identity.operationId,
    identity.attemptId,
  ].join(':');
}

export function parseOperationReplayRef(value: string): OperationReplayRef | null {
  const parts = value.trim().split(':');
  if (parts.length !== 4) return null;
  const version = Number.parseInt(parts[0] ?? '', 10);
  if (version !== OPERATION_REPLAY_REF_VERSION) return null;
  const [, requestId, operationId, attemptId] = parts as [string, string, string, string];
  if (!requestId || !operationId || !attemptId) return null;
  if (!isMintedId(operationId) || !isMintedId(attemptId)) return null;
  return { version, requestId, operationId, attemptId };
}
