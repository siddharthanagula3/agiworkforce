// Surface-neutral, so it holds no transport: a host installs one, and a host
// that installs none emits nothing rather than guessing at a network.
// Restated from apps/web/lib/observability/client-failures.ts, which no module
// here can import; client-failure-contract.test.ts fails when the two disagree.
export const CLIENT_FAILURE_CLASSES = [
  'artifact_load',
  'attachment',
  'code_copy',
  'markdown_render',
  'mermaid_render',
  'stream_stall',
] as const;

export type ClientFailureClass = (typeof CLIENT_FAILURE_CLASSES)[number];

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

export interface ClientFailureReport {
  readonly failure: ClientFailureClass;
  readonly detail?: ClientFailureDetail;
}

export type ClientFailureSink = (report: ClientFailureReport) => void;

let sink: ClientFailureSink | null = null;

export function setClientFailureSink(next: ClientFailureSink | null): void {
  sink = next;
}

export function reportClientFailure(report: ClientFailureReport): void {
  const installed = sink;
  if (!installed) return;
  try {
    installed(report);
  } catch {
    // Reporting is never worth the render it is reporting on.
  }
}
