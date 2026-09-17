'use client';

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { Spinner } from '@agiworkforce/ui';

import { cn } from '@shared/lib/utils';
import { toUserMessage } from '@/lib/user-error-message';

const CALL_LOG_ENDPOINT = '/api/connectors/calls';
const DEFAULT_LIMIT = 20;
const MS_PER_SECOND = 1000;

const CallEntrySchema = z.object({
  connectorId: z.string(),
  toolName: z.string(),
  outcome: z.enum(['succeeded', 'failed', 'blocked']),
  durationMs: z.number().nullable(),
  occurredAt: z.string(),
});

const CallLogSchema = z.object({ calls: z.array(CallEntrySchema) });

type CallEntry = z.infer<typeof CallEntrySchema>;
type CallOutcome = CallEntry['outcome'];

const OUTCOME_LABEL: Record<CallOutcome, string> = {
  succeeded: 'Worked',
  failed: 'Failed',
  blocked: 'Blocked here',
};

const OUTCOME_CLASS: Record<CallOutcome, string> = {
  succeeded: 'text-success-text',
  failed: 'text-danger-text',
  blocked: 'text-warning-text',
};

const HEADING = 'Recent calls';
const LOADING_COPY = 'Reading the call log';
const EMPTY_COPY = 'This connector has not been called yet, so there is nothing to show.';
const FAILED_COPY = 'The call log could not be read.';
const RETRY_LABEL = 'Retry';
const EXPLANATION =
  'What this connector was asked to do and whether it answered. A run of recent failures with no success between them is what marks it as not responding on the connectors list. Arguments and results are never recorded.';

function formatDuration(durationMs: number | null): string | null {
  if (durationMs === null) return null;
  if (durationMs < MS_PER_SECOND) return `${Math.round(durationMs)} ms`;
  return `${(durationMs / MS_PER_SECOND).toFixed(1)} s`;
}

function formatOccurredAt(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

async function fetchCalls(connectorId: string, signal: AbortSignal): Promise<CallEntry[]> {
  const params = new URLSearchParams({ connectorId, limit: String(DEFAULT_LIMIT) });
  const response = await fetch(`${CALL_LOG_ENDPOINT}?${params.toString()}`, {
    credentials: 'include',
    cache: 'no-store',
    signal,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }
  const parsed = CallLogSchema.safeParse(body);
  if (!parsed.success) throw new Error('The call log came back in a shape this page cannot read.');
  return parsed.data.calls;
}

export function ConnectorCallLog({ connectorId }: { connectorId: string }) {
  const [calls, setCalls] = useState<CallEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!connectorId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchCalls(connectorId, controller.signal)
      .then((entries) => {
        if (controller.signal.aborted) return;
        setCalls(entries);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setCalls(null);
        setError(toUserMessage(reason, FAILED_COPY));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt, connectorId]);

  return (
    <section className="space-y-2" aria-labelledby="connector-call-log-heading">
      <div>
        <h3 id="connector-call-log-heading" className="text-sm font-medium text-foreground">
          {HEADING}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{EXPLANATION}</p>
      </div>

      {loading && calls === null ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-5 text-sm text-muted-foreground">
          <Spinner size="sm" aria-label={LOADING_COPY} />
          {LOADING_COPY}
        </div>
      ) : error ? (
        // Announced politely, not assertively: nothing the reader just did has
        // failed, and this dialog keeps the assertive channel for a permission
        // write the server refused.
        <div role="status" className="rounded-lg border border-border bg-muted/50 px-4 py-4">
          <p className="text-xs text-danger-text">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-2 inline-flex min-h-6 items-center px-1 text-xs font-medium underline"
          >
            {RETRY_LABEL}
          </button>
        </div>
      ) : calls === null ? null : calls.length === 0 ? (
        <p className="rounded-lg border border-border bg-muted/50 px-4 py-5 text-sm text-muted-foreground">
          {EMPTY_COPY}
        </p>
      ) : (
        <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-0.5">
          {calls.map((call) => {
            const duration = formatDuration(call.durationMs);
            return (
              <li
                key={`${call.occurredAt}-${call.toolName}`}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg border border-border bg-muted/50 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                  {call.toolName}
                </span>
                <span className={cn('text-xs font-medium', OUTCOME_CLASS[call.outcome])}>
                  {OUTCOME_LABEL[call.outcome]}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {duration ? `${duration} · ` : ''}
                  {formatOccurredAt(call.occurredAt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
