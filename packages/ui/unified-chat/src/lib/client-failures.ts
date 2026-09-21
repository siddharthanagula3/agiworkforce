// Surface-neutral, so it holds no transport: a host installs one, and a host
// that installs none emits nothing rather than guessing at a network.
import type { ClientFailureReport } from '@agiworkforce/types';

export {
  CLIENT_FAILURE_CLASSES,
  CLIENT_FAILURE_DETAILS,
  isClientFailureClass,
  isClientFailureDetail,
  type ClientFailureClass,
  type ClientFailureDetail,
  type ClientFailureReport,
} from '@agiworkforce/types';

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
