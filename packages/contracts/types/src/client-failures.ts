/**
 * What a surface may say when something failed in front of the user.
 *
 * A client failure report is the one signal an untrusted process authors, so
 * the classes are closed and a class the server does not name is dropped. The
 * emitting surface and the ingest both read this module, so neither can widen
 * the vocabulary without the other seeing it.
 */

export const CLIENT_FAILURE_CLASSES = [
  'artifact_load',
  'attachment',
  'code_copy',
  'markdown_render',
  'mermaid_render',
  'stream_stall',
] as const;

export type ClientFailureClass = (typeof CLIENT_FAILURE_CLASSES)[number];

// `rejected` is the product refusing input; `unknown` is an exception nobody
// classified. Collapsing them loses the only actionable half.
export const CLIENT_FAILURE_DETAILS = [
  'network',
  'parse',
  'permission_denied',
  'rejected',
  'render',
  'timeout',
  'too_large',
  'too_many',
  'unknown',
] as const;

export type ClientFailureDetail = (typeof CLIENT_FAILURE_DETAILS)[number];

// One beacon carries at most this many reports; a burst is dropped, not queued.
export const CLIENT_FAILURE_MAX_BATCH = 10;

// A report is six short tokens, so a body near a kilobyte is a client bug or
// an attempt to push content through a route that must never carry any.
export const CLIENT_FAILURE_MAX_BODY_BYTES = 1024;

export interface ClientFailureReport {
  readonly failure: ClientFailureClass;
  readonly detail?: ClientFailureDetail;
}

export function isClientFailureClass(value: unknown): value is ClientFailureClass {
  return typeof value === 'string' && (CLIENT_FAILURE_CLASSES as readonly string[]).includes(value);
}

export function isClientFailureDetail(value: unknown): value is ClientFailureDetail {
  return typeof value === 'string' && (CLIENT_FAILURE_DETAILS as readonly string[]).includes(value);
}
