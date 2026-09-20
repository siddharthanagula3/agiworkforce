import { setClientFailureSink, type ClientFailureReport } from '@agiworkforce/unified-chat';

import { addCsrfHeaders } from '@/lib/client/csrf';
import { hasTelemetryConsent, readDocumentTelemetryConsent } from '@/lib/sentry-shared';

import { CLIENT_FAILURE_MAX_BATCH } from './client-failures';

export const CLIENT_FAILURE_ENDPOINT = '/api/telemetry/client';

const FLUSH_DELAY_MS = 500;

// A render fault arrives in a loop, so the page spends a small budget and then
// goes quiet rather than beating the ingest with the same report.
export const CLIENT_FAILURE_PAGE_BUDGET = 20;

let pending: ClientFailureReport[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let sent = 0;

// The document carries the account's answer, the mirror this session's. Either
// saying no is a no, and an unreadable answer is a no.
function mayReport(): boolean {
  const declared = readDocumentTelemetryConsent();
  if (declared === false) return false;
  return declared === true || hasTelemetryConsent();
}

async function post(events: readonly ClientFailureReport[]): Promise<void> {
  const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
  await fetch(CLIENT_FAILURE_ENDPOINT, {
    method: 'POST',
    headers,
    credentials: 'same-origin',
    keepalive: true,
    body: JSON.stringify({ events }),
  });
}

function flush(): void {
  timer = null;
  const events = pending;
  pending = [];
  if (events.length === 0 || !mayReport()) return;
  // One attempt: a retry is a second request during whatever is already going
  // wrong, and a lost data point costs less.
  void post(events).catch(() => undefined);
}

export function reportClientFailureToPlatform(report: ClientFailureReport): void {
  if (typeof window === 'undefined' || sent >= CLIENT_FAILURE_PAGE_BUDGET) return;
  if (!mayReport()) return;
  sent += 1;
  pending.push(report);
  if (pending.length >= CLIENT_FAILURE_MAX_BATCH) {
    if (timer) clearTimeout(timer);
    flush();
    return;
  }
  timer ??= setTimeout(flush, FLUSH_DELAY_MS);
}

// Points the shared chat surface at this platform. Idempotent, so a second
// mount replaces the sink rather than doubling reports.
export function installClientFailureReporting(): void {
  if (typeof window === 'undefined') return;
  setClientFailureSink(reportClientFailureToPlatform);
}

export function resetClientFailureTransport(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  pending = [];
  sent = 0;
}
