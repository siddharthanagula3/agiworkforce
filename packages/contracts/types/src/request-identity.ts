/**
 * The three identifiers every request carries, and the one it may inherit.
 *
 * `audit.ts` already stores the joined form on every record, so a trail, a
 * span and a settlement can be reconciled. Nothing built it: each surface
 * assembled the string itself, which is how a retry gets a fresh request id
 * and stops being a retry.
 *
 * - `requestId` is the call. It changes when the caller asks again.
 * - `operationId` is the thing being done, and survives every retry of it.
 * - `attemptId` is this try. Only this changes when the attempt is repeated.
 * - `parentTaskId` is the run that asked, absent when a person did.
 *
 * @module request-identity
 */

import { AUDIT_EVENT_SCHEMA_VERSION } from './audit';

export interface RequestIdentity {
  requestId: string;
  operationId: string;
  attemptId: string;
  /** The task this request serves, when something other than a person asked. */
  parentTaskId?: string;
}

const SEGMENT = /^[A-Za-z0-9._-]{1,128}$/;
const OPERATION_REF_SEGMENTS = 4;

export function isRequestIdentitySegment(value: unknown): value is string {
  return typeof value === 'string' && SEGMENT.test(value);
}

export function isRequestIdentity(value: unknown): value is RequestIdentity {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (
    !['requestId', 'operationId', 'attemptId'].every((key) =>
      isRequestIdentitySegment(candidate[key]),
    )
  ) {
    return false;
  }
  return (
    candidate['parentTaskId'] === undefined || isRequestIdentitySegment(candidate['parentTaskId'])
  );
}

/**
 * The joined form an audit record, a span and a settlement all quote. The
 * schema version leads it so a reader meeting a longer ref knows it is reading
 * a shape it does not have rather than a request id with colons in it.
 */
export function formatOperationRef(identity: RequestIdentity): string {
  return [
    String(AUDIT_EVENT_SCHEMA_VERSION),
    identity.requestId,
    identity.operationId,
    identity.attemptId,
  ].join(':');
}

export function parseOperationRef(ref: string): RequestIdentity | null {
  const parts = ref.split(':');
  if (parts.length !== OPERATION_REF_SEGMENTS) return null;
  const [version, requestId, operationId, attemptId] = parts;
  if (version !== String(AUDIT_EVENT_SCHEMA_VERSION)) return null;
  const identity = { requestId, operationId, attemptId };
  return isRequestIdentity(identity) ? identity : null;
}

/**
 * The identity of the next try at the same operation. Keeping the operation id
 * is what lets a settlement recognise work it has already paid for; minting a
 * new attempt id is what lets the trail show it was tried twice.
 */
export function nextAttempt(identity: RequestIdentity, attemptId: string): RequestIdentity {
  return { ...identity, attemptId };
}

/** True when two identities are tries at one operation rather than two calls. */
export function sameOperation(left: RequestIdentity, right: RequestIdentity): boolean {
  return left.operationId === right.operationId;
}
