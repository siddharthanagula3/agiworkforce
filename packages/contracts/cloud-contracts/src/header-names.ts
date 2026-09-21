/**
 * Request headers every surface and the server must spell identically.
 *
 * A header name written at a call site is a name that drifts: one module owns
 * each of these so a client and the route reading it can never disagree.
 *
 * @module header-names
 */

/** Joins one client request to the server's answer, in both sets of logs. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Makes a retry of a mutating request apply once rather than twice. */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/** Which sync exchange the caller speaks, read against the floor in `sync`. */
export const SYNC_PROTOCOL_VERSION_HEADER = 'x-agi-sync-protocol';

export const MAX_REQUEST_ID_LENGTH = 128;

const REQUEST_ID_PATTERN = new RegExp(`^[A-Za-z0-9._~-]{1,${MAX_REQUEST_ID_LENGTH}}$`, 'u');

/**
 * A request id is written into logs and echoed to the caller, so its shape is
 * bounded here rather than trusted. Anything else is discarded, never repaired.
 */
export function isWellFormedRequestId(value: string | null | undefined): value is string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

/** The shape a client mints when it has no id of its own to correlate with. */
export function newRequestId(): string {
  return crypto.randomUUID();
}
