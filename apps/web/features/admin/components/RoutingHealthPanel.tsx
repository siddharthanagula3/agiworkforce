'use client';

import { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';
import type { RouteBreakerState } from '@agiworkforce/routing';
import { toUserMessage } from '@/lib/user-error-message';
import type { RouteScopeHealthRow, RoutingHealthSummary } from '../services/routing-health-metrics';
import {
  formatCount,
  formatDateTime,
  formatRate,
  formatWindowMs,
  NONE,
} from '../lib/operator-format';

const ROUTING_HEALTH_ENDPOINT = '/api/admin/routing-health';
const PROVIDER_PARAM = 'provider';

const CARD_CLASS = 'rounded-2xl border border-border bg-card p-5';
const TABLE_WRAP_CLASS = 'overflow-x-auto rounded-2xl border border-border';

const STATE_LABEL: Record<RouteBreakerState, string> = {
  closed: 'Closed',
  degraded: 'Degraded',
  open: 'Open',
  half_open: 'Half open',
};

const UNFUNDED_LABEL = 'Unfunded';

const UNFUNDED_CLASS =
  'border-red-600/40 bg-red-500/10 text-red-800 dark:border-red-400/30 dark:text-red-100';

const STATE_CLASS: Record<RouteBreakerState, string> = {
  closed: 'border-border bg-muted text-foreground',
  degraded:
    'border-amber-600/40 bg-amber-500/10 text-amber-800 dark:border-amber-400/30 dark:text-amber-100',
  open: 'border-red-600/40 bg-red-500/10 text-red-800 dark:border-red-400/30 dark:text-red-100',
  half_open:
    'border-sky-600/40 bg-sky-500/10 text-sky-800 dark:border-sky-300/30 dark:text-sky-100',
};

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }
  return body as T;
}

function StateBadge({ state }: { state: RouteBreakerState }) {
  return (
    <span
      data-breaker-state={state}
      className={`whitespace-nowrap rounded-md border px-2 py-1 text-xs ${STATE_CLASS[state]}`}
    >
      {STATE_LABEL[state]}
    </span>
  );
}

export default function RoutingHealthPanel() {
  const [summary, setSummary] = useState<RoutingHealthSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openProvider, setOpenProvider] = useState<string | null>(null);
  const [routes, setRoutes] = useState<RouteScopeHealthRow[] | null>(null);
  const [routesError, setRoutesError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSummary(await readJson<RoutingHealthSummary>(ROUTING_HEALTH_ENDPOINT));
    } catch (loadError) {
      setError(toUserMessage(loadError, 'Could not read routing health.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleProvider(provider: string) {
    if (openProvider === provider) {
      setOpenProvider(null);
      setRoutes(null);
      return;
    }
    setOpenProvider(provider);
    setRoutes(null);
    setRoutesError(null);
    try {
      const body = await readJson<{ routes: RouteScopeHealthRow[] }>(
        `${ROUTING_HEALTH_ENDPOINT}?${PROVIDER_PARAM}=${encodeURIComponent(provider)}`,
      );
      setRoutes(body.routes);
    } catch (loadError) {
      setRoutesError(toUserMessage(loadError, 'Could not read route lockouts.'));
    }
  }

  const observedProviders =
    summary?.providers.filter(
      (row) =>
        row.providerObservations.sampleCount > 0 || row.credentialObservations.sampleCount > 0,
    ) ?? [];

  return (
    <section className="flex flex-col gap-4" aria-labelledby="routing-health-title">
      <div>
        <h2 id="routing-health-title" className="text-sm font-medium">
          Routing health
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          The breakers the router already acts on, read only. A provider breaker opens on server
          errors and timeouts; a credential cooldown opens on rate limits and auth refusals, and
          reads unfunded when the account behind the key is out of money, which serves nothing until
          someone pays even while the cooldown is closed; route lockouts are per route and read on
          demand below.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : summary === null ? (
        <div className={`${CARD_CLASS} flex items-center gap-3`}>
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">Reading breaker state…</span>
        </div>
      ) : (
        <>
          {observedProviders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No provider has recorded an outcome inside its observation window, so every row below
              is the healthy default rather than a measurement. Rows carry real samples once traffic
              runs through the router.
            </p>
          ) : null}

          <div className={TABLE_WRAP_CLASS}>
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-card text-left">
                <tr>
                  <th className="p-3 font-medium">Provider</th>
                  <th className="p-3 font-medium">Credential class</th>
                  <th className="p-3 font-medium">Provider breaker</th>
                  <th className="p-3 font-medium">Credential cooldown</th>
                  <th className="p-3 font-medium">Samples</th>
                  <th className="p-3 font-medium">Success</th>
                  <th className="p-3 font-medium">Thresholds</th>
                  <th className="p-3 font-medium">Cooldown until</th>
                  <th className="p-3 font-medium">Routes</th>
                </tr>
              </thead>
              <tbody>
                {summary.providers.map((row) => (
                  <tr key={row.provider} className="border-t border-border">
                    <td className="p-3 font-mono text-xs">{row.provider}</td>
                    <td className="p-3 text-xs">{row.credentialClass}</td>
                    <td className="p-3">
                      <StateBadge state={row.providerState} />
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col items-start gap-1">
                        <StateBadge state={row.credentialState} />
                        {row.credentialUnfunded ? (
                          <span
                            data-credential-unfunded
                            className={`whitespace-nowrap rounded-md border px-2 py-1 text-xs ${UNFUNDED_CLASS}`}
                          >
                            {UNFUNDED_LABEL}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="p-3 tabular-nums">
                      {formatCount(row.providerObservations.sampleCount)}
                    </td>
                    <td className="p-3 tabular-nums">
                      {formatRate(row.providerObservations.successRate)}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      degrade {row.degradeAtFailures} · open {row.openAtFailures} · window{' '}
                      {formatWindowMs(row.observationWindowMs)} · reset{' '}
                      {formatWindowMs(row.resetMs)}
                    </td>
                    <td data-cooldown className="p-3 text-xs text-muted-foreground">
                      {row.providerObservations.cooldownUntil
                        ? formatDateTime(row.providerObservations.cooldownUntil)
                        : NONE}
                    </td>
                    <td className="p-3">
                      <button
                        aria-expanded={openProvider === row.provider}
                        onClick={() => void toggleProvider(row.provider)}
                        className="rounded-full border border-border px-3 py-1 text-xs transition-colors hover:border-foreground/30"
                      >
                        {openProvider === row.provider ? 'Hide' : `${row.liveRoutes} live`}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {openProvider ? (
            <div className={CARD_CLASS}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium">
                  Route lockouts, <span className="font-mono text-xs">{openProvider}</span>
                </h3>
                <span className="text-xs text-muted-foreground">
                  opens at {summary.lockoutOpenAtFailures} consecutive failures over{' '}
                  {formatWindowMs(summary.lockoutWindowMs)}
                </span>
              </div>

              {routesError ? (
                <p role="alert" className="mt-3 text-sm text-danger">
                  {routesError}
                </p>
              ) : routes === null ? (
                <div className="mt-4 flex items-center gap-3">
                  <Spinner size="sm" />
                  <span className="text-sm text-muted-foreground">Reading route lockouts…</span>
                </div>
              ) : routes.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  The registry lists no live route for this provider.
                </p>
              ) : (
                <div className={`mt-4 ${TABLE_WRAP_CLASS}`}>
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-card text-left">
                      <tr>
                        <th className="p-3 font-medium">Route</th>
                        <th className="p-3 font-medium">Lockout</th>
                        <th className="p-3 font-medium">Samples</th>
                        <th className="p-3 font-medium">Success</th>
                        <th className="p-3 font-medium">Rate limit</th>
                        <th className="p-3 font-medium">Server error</th>
                        <th className="p-3 font-medium">Timeout</th>
                        <th className="p-3 font-medium">Consecutive failures</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routes.map((route) => (
                        <tr key={route.routeId} className="border-t border-border">
                          <td className="p-3 font-mono text-xs">{route.routeId}</td>
                          <td className="p-3">
                            <StateBadge state={route.state} />
                          </td>
                          <td className="p-3 tabular-nums">
                            {formatCount(route.observations.sampleCount)}
                          </td>
                          <td className="p-3 tabular-nums">
                            {formatRate(route.observations.successRate)}
                          </td>
                          <td className="p-3 tabular-nums">
                            {formatRate(route.observations.rateLimitRate)}
                          </td>
                          <td className="p-3 tabular-nums">
                            {formatRate(route.observations.serverErrorRate)}
                          </td>
                          <td className="p-3 tabular-nums">
                            {formatRate(route.observations.timeoutRate)}
                          </td>
                          <td className="p-3 tabular-nums">
                            {formatCount(route.observations.consecutiveFailures)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
