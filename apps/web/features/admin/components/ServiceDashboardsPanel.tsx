'use client';

import { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';

import { toUserMessage } from '@/lib/user-error-message';
import type { ServiceDashboardsReport } from '@/lib/observability/dashboards';

const SERVICE_DASHBOARDS_ENDPOINT = '/api/admin/service-dashboards';

const CARD_CLASS = 'rounded-2xl border border-border bg-card p-5';

const AGGREGATION_LABEL: Record<string, string> = {
  rate: 'per-second rate',
  ratio: 'share of a matching total',
  p50: 'median',
  p95: '95th percentile',
};

async function readReport(): Promise<ServiceDashboardsReport> {
  const response = await fetch(SERVICE_DASHBOARDS_ENDPOINT, { cache: 'no-store' });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }
  return body as ServiceDashboardsReport;
}

function BackendNotice({ report }: { report: ServiceDashboardsReport }) {
  if (!report.metricsBackendConfigured) {
    return (
      <div role="status" className={`${CARD_CLASS} border-warning-fill/40`}>
        <p className="text-sm font-medium text-warning-text">No metrics backend is configured.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Nothing is exporting metrics from this deployment, so none of these panels has a series to
          draw. The definitions below are what would be queried once an OpenTelemetry exporter
          endpoint is set; a chart drawn now would be empty for that reason and not because the
          service is idle.
        </p>
      </div>
    );
  }

  return (
    <div role="status" className={CARD_CLASS}>
      <p className="text-sm font-medium text-success-text">A metrics backend is configured.</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Run these against your metrics store. Series are emitted under the service name{' '}
        <code className="font-mono">{report.serviceName ?? 'unset'}</code>.
      </p>
    </div>
  );
}

export default function ServiceDashboardsPanel() {
  const [report, setReport] = useState<ServiceDashboardsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setReport(await readReport());
    } catch (loadError) {
      setReport(null);
      setError(toUserMessage(loadError, 'Could not read the service dashboards.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="service-dashboards-title">
      <div>
        <h2 id="service-dashboards-title" className="text-sm font-medium">
          Service dashboards
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          The panel definitions this deployment ships, each with the query that draws it, so a
          dashboard can be rebuilt in whatever metrics store you run.
        </p>
      </div>

      {error ? (
        <div role="alert" className={CARD_CLASS}>
          <p className="text-sm text-danger-text">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-2 inline-flex min-h-6 items-center text-xs font-medium underline"
          >
            Try again
          </button>
        </div>
      ) : loading ? (
        <div className={`${CARD_CLASS} flex items-center gap-3`}>
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">Reading the dashboard definitions…</span>
        </div>
      ) : report === null ? null : (
        <>
          <BackendNotice report={report} />

          {report.dashboards.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This deployment defines no dashboards, so there is nothing to rebuild.
            </p>
          ) : (
            report.dashboards.map((dashboard) => (
              <section
                key={dashboard.id}
                className={CARD_CLASS}
                aria-labelledby={`service-dashboard-${dashboard.id}`}
              >
                <h3 id={`service-dashboard-${dashboard.id}`} className="text-sm font-medium">
                  {dashboard.title}
                </h3>
                <ul className="mt-4 flex flex-col gap-3">
                  {dashboard.panels.map((panel) => (
                    <li
                      key={panel.id}
                      className="rounded-xl border border-border bg-background p-4"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-medium">{panel.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {AGGREGATION_LABEL[panel.aggregation] ?? panel.aggregation}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{panel.metric}</p>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs">
                        {panel.query}
                      </pre>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </section>
  );
}
