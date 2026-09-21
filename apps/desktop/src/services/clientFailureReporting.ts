import { setClientFailureSink, type ClientFailureReport } from '@agiworkforce/unified-chat';

import { CLOUD_API_BASE_URL, cloudFetch, getAuthHeaders } from '../api/cloudApi';
import { isPrivateTrustBoundary } from '../stores/privacyBoundary';

export const CLIENT_FAILURE_ENDPOINT = '/api/telemetry/client';

/**
 * A render fault arrives in a loop, so the shell spends a small budget and
 * then goes quiet rather than beating the ingest with the same report.
 */
export const CLIENT_FAILURE_SESSION_BUDGET = 20;

let sent = 0;

/**
 * The shell renders the same chat components the browser does, and every
 * failure they counted was dropped here because no host had installed a sink:
 * the client health dashboard read no failures for desktop while the surface
 * was producing them. The product event stream is the account's, so this rides
 * the Managed Cloud transport the app already holds and is gated by the same
 * trust boundary the product analytics emitter uses, not by a second switch.
 */
async function post(report: ClientFailureReport): Promise<void> {
  const headers = await getAuthHeaders();
  await cloudFetch(`${CLOUD_API_BASE_URL}${CLIENT_FAILURE_ENDPOINT}`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ events: [report] }),
  });
}

export function reportClientFailureToCloud(report: ClientFailureReport): void {
  if (sent >= CLIENT_FAILURE_SESSION_BUDGET) return;
  if (isPrivateTrustBoundary()) return;
  sent += 1;
  // One attempt, and never a rejection out of the render this is reporting on:
  // a retry is a second request during whatever is already going wrong, and a
  // lost data point costs less than the fault it would add.
  void post(report).catch(() => undefined);
}

export function installClientFailureReporting(): void {
  setClientFailureSink(reportClientFailureToCloud);
}

export function resetClientFailureReporting(): void {
  sent = 0;
  setClientFailureSink(null);
}
