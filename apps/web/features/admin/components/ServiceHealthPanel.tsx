'use client';

import { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';
import { toUserMessage } from '@/lib/user-error-message';
import type { ServiceHealthSummary } from '../services/service-health-metrics';
import {
  formatCount,
  formatDateTime,
  formatLatencyMs,
  formatRate,
  formatWindowMs,
  NONE,
} from '../lib/operator-format';

const SERVICE_HEALTH_ENDPOINT = '/api/admin/service-health';

const CARD_CLASS = 'rounded-2xl border border-border bg-card p-5';
const TABLE_WRAP_CLASS = 'overflow-x-auto rounded-2xl border border-border';

async function readSummary(): Promise<ServiceHealthSummary> {
  const response = await fetch(SERVICE_HEALTH_ENDPOINT, { cache: 'no-store' });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }
  return body as ServiceHealthSummary;
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className={CARD_CLASS} aria-labelledby={id}>
      <h3 id={id} className="text-sm font-medium">
        {title}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function ServiceHealthPanel() {
  const [summary, setSummary] = useState<ServiceHealthSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSummary(await readSummary());
    } catch (loadError) {
      setError(toUserMessage(loadError, 'Could not read service health.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="service-health-title">
      <div>
        <h2 id="service-health-title" className="text-sm font-medium">
          Service health
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          File processing, queues, remote devices, browser commands and tool calls, read from the
          records each path already writes. Rates cover the window shown; queue depth is live.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : summary === null ? (
        <div className={`${CARD_CLASS} flex items-center gap-3`}>
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">Reading service health…</span>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {formatDateTime(summary.windowStart)} to {formatDateTime(summary.windowEnd)}
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section
              id="service-health-files"
              title="File processing"
              description="Project knowledge files added in the window and how many yielded text."
            >
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Metric label="Uploaded" value={formatCount(summary.files.uploaded)} />
                <Metric label="Text extracted" value={formatCount(summary.files.extracted)} />
                <Metric
                  label="Extraction rate"
                  value={formatRate(summary.files.extractionRate)}
                  sub={`${formatCount(summary.files.withoutText)} without text`}
                />
                <Metric
                  label="Median extraction"
                  value={formatLatencyMs(summary.files.extractionP50Ms)}
                />
              </div>
            </Section>

            <Section
              id="service-health-remote"
              title="Remote connection health"
              description="Steps a cloud turn sent to a paired device, and the desktops that checked in."
            >
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Metric
                  label="Device steps"
                  value={formatCount(summary.remote.deviceSteps)}
                  sub={`${formatCount(summary.remote.waiting)} waiting`}
                />
                <Metric
                  label="Failure rate"
                  value={formatRate(summary.remote.failureRate)}
                  sub={`${formatCount(summary.remote.failed)} failed`}
                />
                <Metric
                  label="Median answer"
                  value={formatLatencyMs(summary.remote.resolveP50Ms)}
                />
                <Metric
                  label="Desktops online"
                  value={formatCount(summary.remote.devicesOnline)}
                  sub={`${formatCount(summary.remote.devicesSeenInWindow)} seen in window`}
                />
              </div>
            </Section>

            <Section
              id="service-health-browser"
              title="Browser health"
              description="Browser commands the model handed to the extension or desktop browser."
            >
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Metric label="Commands" value={formatCount(summary.browser.commands)} />
                <Metric label="Handed off" value={formatCount(summary.browser.handedOff)} />
                <Metric label="Blocked" value={formatCount(summary.browser.blocked)} />
                <Metric
                  label="Failure rate"
                  value={formatRate(summary.browser.failureRate)}
                  sub={`${formatCount(summary.browser.failures)} failed`}
                />
              </div>
            </Section>

            <Section
              id="service-health-queues"
              title="Queue depth"
              description="Work waiting to start and work in flight, right now."
            >
              <div className={TABLE_WRAP_CLASS}>
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="bg-card text-left">
                    <tr>
                      <th className="p-3 font-medium">Queue</th>
                      <th className="p-3 font-medium">Waiting</th>
                      <th className="p-3 font-medium">In flight</th>
                      <th className="p-3 font-medium">Oldest waiting</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.queues.map((row) => (
                      <tr key={row.queue} className="border-t border-border">
                        <td className="p-3 font-mono text-xs">{row.queue}</td>
                        <td className="p-3 tabular-nums">{formatCount(row.depth)}</td>
                        <td className="p-3 tabular-nums">{formatCount(row.inFlight)}</td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {row.oldestWaitingAt ? formatDateTime(row.oldestWaitingAt) : NONE}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>

          <Section
            id="service-health-tools"
            title="Tool latency and failures"
            description={`Every tool call the agent loop recorded, by category, over ${formatWindowMs(
              new Date(summary.windowEnd).getTime() - new Date(summary.windowStart).getTime(),
            )}. MCP and connector rows are the MCP and connector failure counts.`}
          >
            {summary.tools.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No tool call was recorded in the window.
              </p>
            ) : (
              <div className={TABLE_WRAP_CLASS}>
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-card text-left">
                    <tr>
                      <th className="p-3 font-medium">Category</th>
                      <th className="p-3 font-medium">Calls</th>
                      <th className="p-3 font-medium">Failed</th>
                      <th className="p-3 font-medium">Failure rate</th>
                      <th className="p-3 font-medium">Blocked</th>
                      <th className="p-3 font-medium">p50</th>
                      <th className="p-3 font-medium">p95</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.tools.map((row) => (
                      <tr key={row.category} className="border-t border-border">
                        <td className="p-3 font-mono text-xs">{row.category}</td>
                        <td className="p-3 tabular-nums">{formatCount(row.calls)}</td>
                        <td className="p-3 tabular-nums">{formatCount(row.failures)}</td>
                        <td className="p-3 tabular-nums">{formatRate(row.failureRate)}</td>
                        <td className="p-3 tabular-nums">{formatCount(row.blocked)}</td>
                        <td className="p-3 tabular-nums">{formatLatencyMs(row.latencyP50Ms)}</td>
                        <td className="p-3 tabular-nums">{formatLatencyMs(row.latencyP95Ms)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </section>
  );
}
