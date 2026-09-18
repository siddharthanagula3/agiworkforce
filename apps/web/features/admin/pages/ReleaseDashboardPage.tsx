'use client';

import { Spinner } from '@agiworkforce/ui';
import { useCallback, useEffect, useState } from 'react';

interface ReleaseEvent {
  id: number;
  event: 'promoted' | 'rolled_back' | 'verification_failed' | 'rollback_drill';
  surface: string;
  environment: string;
  outcome: 'succeeded' | 'failed';
  commitSha: string | null;
  deploymentId: string | null;
  previousDeploymentId: string | null;
  actor: string;
  source: string;
  reason: string | null;
  runUrl: string | null;
  recordedAt: string;
}

interface ReleaseLedgerEntry {
  surface: string;
  commitSha: string;
  deploymentRef: string | null;
  headSequence: number;
  headFilename: string;
  appliedCount: number;
  verifiedAt: string;
}

interface ReleaseDashboard {
  serving: {
    commit: string | null;
    environment: string | null;
    deploymentId: string | null;
    region: string | null;
  };
  ledger: ReleaseLedgerEntry[];
  events: ReleaseEvent[];
  chain: { intact: boolean; brokenAt: number | null };
  lastRollback: ReleaseEvent | null;
  lastDrill: ReleaseEvent | null;
  drillAgeDays: number | null;
  ledgerMatchesServing: boolean | null;
  retentionDays: number;
  unreadable: string[];
}

const EVENT_LABELS: Record<ReleaseEvent['event'], string> = {
  promoted: 'Promoted',
  rolled_back: 'Rolled back',
  verification_failed: 'Verification failed',
  rollback_drill: 'Rollback drill',
};

const DRILL_STALE_AFTER_DAYS = 35;

function formatTimestamp(value: string | null): string {
  if (!value) return 'Never';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Unknown' : parsed.toLocaleString();
}

function shortSha(value: string | null): string {
  return value ? value.slice(0, 12) : 'unknown';
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // fall through
  }
  return `Request failed (${response.status})`;
}

function Claim({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={warn ? 'mt-1 text-sm text-danger-text' : 'mt-1 text-sm text-foreground'}>
        {value}
      </p>
    </div>
  );
}

export default function ReleaseDashboardPage() {
  const [data, setData] = useState<ReleaseDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/releases', { credentials: 'include' });
      if (!response.ok) {
        setError(await readError(response));
        setData(null);
        return;
      }
      setData((await response.json()) as ReleaseDashboard);
    } catch {
      setError('The release dashboard could not be loaded.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const drillStale =
    data !== null && (data.drillAgeDays === null || data.drillAgeDays > DRILL_STALE_AFTER_DAYS);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
        <header>
          <h1 className="text-2xl font-medium text-foreground">Releases</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            What production is serving, what the migration ledger recorded for it, and every
            promotion, rollback and rollback drill the audit trail holds. Each claim on this page is
            a row; nothing here is asserted from configuration.
          </p>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="mt-4 rounded border border-input px-3 py-1 text-xs text-foreground disabled:opacity-50"
          >
            Refresh
          </button>
        </header>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-danger-text"
          >
            {error}
          </p>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Spinner size="sm" />
            Loading the release trail
          </div>
        ) : null}

        {data ? (
          <>
            <section className="rounded-md border border-border bg-card p-5">
              <h2 className="text-base font-medium text-foreground">Serving now</h2>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Claim label="Commit" value={shortSha(data.serving.commit)} />
                <Claim label="Environment" value={data.serving.environment ?? 'unknown'} />
                <Claim label="Deployment" value={data.serving.deploymentId ?? 'unknown'} />
                <Claim label="Region" value={data.serving.region ?? 'unknown'} />
                <Claim
                  label="Ledger agrees with the running commit"
                  value={
                    data.ledgerMatchesServing === null
                      ? 'No production record to compare'
                      : data.ledgerMatchesServing
                        ? 'Yes'
                        : 'No, production is not the commit last recorded'
                  }
                  warn={data.ledgerMatchesServing === false}
                />
                <Claim
                  label="Audit chain"
                  value={
                    data.chain.intact
                      ? `Intact over the last ${data.events.length} events`
                      : `Broken at event ${data.chain.brokenAt}`
                  }
                  warn={!data.chain.intact}
                />
              </div>
            </section>

            <section className="rounded-md border border-border bg-card p-5">
              <h2 className="text-base font-medium text-foreground">Rollback readiness</h2>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Claim
                  label="Last rollback"
                  value={
                    data.lastRollback
                      ? `${formatTimestamp(data.lastRollback.recordedAt)} to ${
                          data.lastRollback.deploymentId ?? 'unknown'
                        }`
                      : 'None recorded'
                  }
                />
                <Claim
                  label="Last successful rollback drill"
                  value={
                    data.lastDrill
                      ? `${formatTimestamp(data.lastDrill.recordedAt)} (${data.drillAgeDays} days ago)`
                      : 'Never; the rollback path is untested'
                  }
                  warn={drillStale}
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                The trail is append-only and rows cannot be removed for {data.retentionDays} days.
              </p>
            </section>

            <section className="rounded-md border border-border bg-card p-5">
              <h2 className="text-base font-medium text-foreground">Migration ledger</h2>
              {data.ledger.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {data.unreadable.includes('ledger')
                    ? 'The ledger could not be read, so this is not a claim that nothing shipped.'
                    : 'No production deployment has been recorded.'}
                </p>
              ) : (
                <ul className="mt-4 flex flex-col gap-3">
                  {data.ledger.map((entry) => (
                    <li
                      key={`${entry.surface}-${entry.commitSha}`}
                      className="rounded border border-border p-3"
                    >
                      <p className="text-sm text-foreground">
                        {entry.surface} at {shortSha(entry.commitSha)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTimestamp(entry.verifiedAt)} · migration {entry.headFilename} ·{' '}
                        {entry.appliedCount} applied
                        {entry.deploymentRef ? ` · ${entry.deploymentRef}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-md border border-border bg-card p-5">
              <h2 className="text-base font-medium text-foreground">Release audit trail</h2>
              {data.events.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {data.unreadable.includes('events')
                    ? 'The audit trail could not be read, so this is not a claim that nothing happened.'
                    : 'No release event recorded yet.'}
                </p>
              ) : (
                <ul className="mt-4 flex flex-col gap-3">
                  {data.events.map((event) => (
                    <li key={event.id} className="rounded border border-border p-3">
                      <p className="text-sm text-foreground">
                        {EVENT_LABELS[event.event]} · {event.surface} · {event.environment}
                        {event.outcome === 'failed' ? (
                          <span className="ml-2 text-danger-text">failed</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTimestamp(event.recordedAt)} · {event.actor} via {event.source} ·{' '}
                        {shortSha(event.commitSha)}
                        {event.previousDeploymentId ? ` · from ${event.previousDeploymentId}` : ''}
                      </p>
                      {event.reason ? (
                        <p className="mt-1 text-xs text-muted-foreground">{event.reason}</p>
                      ) : null}
                      {event.runUrl ? (
                        <a
                          href={event.runUrl}
                          rel="noreferrer noopener"
                          target="_blank"
                          className="mt-1 inline-block text-xs text-foreground underline"
                        >
                          Workflow run
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
