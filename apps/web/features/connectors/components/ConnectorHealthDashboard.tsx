'use client';

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { Spinner } from '@agiworkforce/ui';

import { cn } from '@shared/lib/utils';
import { toUserMessage } from '@/lib/user-error-message';
import { CONNECTORS } from '@/features/connectors/data/connectors';

const HEALTH_ENDPOINT = '/api/connectors/health';
const MS_PER_SECOND = 1000;

const HealthEntrySchema = z.object({
  connectorId: z.string(),
  state: z.enum(['responding', 'degraded', 'not-responding', 'unknown']),
  calls: z.number(),
  meteredCalls: z.number(),
  failures: z.number(),
  blocked: z.number(),
  failureRatio: z.number(),
  consecutiveFailures: z.number(),
  p50LatencyMs: z.number().nullable(),
  p95LatencyMs: z.number().nullable(),
  lastCallAt: z.string().nullable(),
  circuit: z.enum(['closed', 'half-open', 'open']),
  retryAfterMs: z.number(),
});

const HealthSchema = z.object({ connectors: z.array(HealthEntrySchema) });

type HealthEntry = z.infer<typeof HealthEntrySchema>;
type HealthState = HealthEntry['state'];

const HEADING = 'Connector health';
const EXPLANATION =
  'Measured from this account’s own recent calls: how many ran, how many failed, and how long the provider took. A connector whose last calls all failed is paused with a backoff before it is called again.';
const LOADING_COPY = 'Reading connector health';
const FAILED_COPY = 'Connector health could not be read.';
const EMPTY_COPY = 'No connector has been called in the last hour, so there is nothing to measure.';
const RETRY_LABEL = 'Retry';
const REFRESH_LABEL = 'Refresh';

const STATE_LABEL: Record<HealthState, string> = {
  responding: 'Responding',
  degraded: 'Degraded',
  'not-responding': 'Not responding',
  unknown: 'Not called yet',
};

const STATE_CLASS: Record<HealthState, string> = {
  responding: 'text-success-text',
  degraded: 'text-warning-text',
  'not-responding': 'text-danger-text',
  unknown: 'text-muted-foreground',
};

const DOT_CLASS: Record<HealthState, string> = {
  responding: 'bg-success-fill',
  degraded: 'bg-warning-fill',
  'not-responding': 'bg-danger-fill',
  unknown: 'bg-muted-foreground/40',
};

function connectorName(connectorId: string): string {
  return CONNECTORS.find((connector) => connector.id === connectorId)?.name ?? connectorId;
}

function formatLatency(ms: number | null): string {
  if (ms === null) return 'no timing';
  return ms < MS_PER_SECOND ? `${Math.round(ms)} ms` : `${(ms / MS_PER_SECOND).toFixed(1)} s`;
}

function formatWait(ms: number): string {
  return `${Math.max(1, Math.ceil(ms / MS_PER_SECOND))}s`;
}

function circuitSentence(entry: HealthEntry): string | null {
  if (entry.circuit === 'open') {
    return `Paused after ${entry.consecutiveFailures} failures in a row. The next call is allowed in ${formatWait(entry.retryAfterMs)}.`;
  }
  if (entry.circuit === 'half-open') {
    return `Paused after ${entry.consecutiveFailures} failures in a row. The next call is a trial: one success closes the pause.`;
  }
  return null;
}

async function fetchHealth(signal: AbortSignal): Promise<HealthEntry[]> {
  const response = await fetch(HEALTH_ENDPOINT, {
    credentials: 'include',
    cache: 'no-store',
    signal,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }
  const parsed = HealthSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error('Connector health came back in a shape this page cannot read.');
  }
  return parsed.data.connectors;
}

export function ConnectorHealthDashboard({ className }: { className?: string }) {
  const [entries, setEntries] = useState<HealthEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchHealth(controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setEntries(next);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setEntries(null);
        setError(toUserMessage(reason, FAILED_COPY));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);

  return (
    <section className={cn('space-y-2', className)} aria-labelledby="connector-health-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="connector-health-heading" className="text-sm font-medium text-foreground">
            {HEADING}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{EXPLANATION}</p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="min-h-6 shrink-0 px-1 text-xs font-medium underline disabled:opacity-50"
        >
          {REFRESH_LABEL}
        </button>
      </div>

      {loading && entries === null ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-5 text-sm text-muted-foreground">
          <Spinner size="sm" aria-label={LOADING_COPY} />
          {LOADING_COPY}
        </div>
      ) : error ? (
        <div role="status" className="rounded-lg border border-border bg-muted/50 px-4 py-4">
          <p className="text-xs text-danger-text">{error}</p>
          <button
            type="button"
            onClick={refresh}
            className="mt-2 inline-flex min-h-6 items-center px-1 text-xs font-medium underline"
          >
            {RETRY_LABEL}
          </button>
        </div>
      ) : entries === null ? null : entries.length === 0 ? (
        <p className="rounded-lg border border-border bg-muted/50 px-4 py-5 text-sm text-muted-foreground">
          {EMPTY_COPY}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((entry) => {
            const circuit = circuitSentence(entry);
            return (
              <li
                key={entry.connectorId}
                className="rounded-lg border border-border bg-muted/50 px-3 py-2"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span
                    aria-hidden="true"
                    className={cn('h-2 w-2 shrink-0 rounded-full', DOT_CLASS[entry.state])}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {connectorName(entry.connectorId)}
                  </span>
                  <span className={cn('text-xs font-medium', STATE_CLASS[entry.state])}>
                    {STATE_LABEL[entry.state]}
                  </span>
                </div>
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {entry.meteredCalls} call{entry.meteredCalls === 1 ? '' : 's'} metered ·{' '}
                  {entry.failures} failed · median {formatLatency(entry.p50LatencyMs)} · 95th{' '}
                  {formatLatency(entry.p95LatencyMs)}
                  {entry.blocked > 0 ? ` · ${entry.blocked} blocked here` : ''}
                </p>
                {circuit ? <p className="mt-1 text-xs text-danger-text">{circuit}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
