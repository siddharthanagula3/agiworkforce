'use client';

import { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';
import { toUserMessage } from '@/lib/user-error-message';
import type { OperatorCostWindow, OperatorCosts } from '../services/operator-cost-metrics';
import type {
  ObservabilityDimension,
  ObservabilityMetricsRow,
  RequestExplain,
} from '@/lib/services/route-cache-observability-service';
import {
  formatCents,
  formatCount,
  formatDateTime,
  formatLatencyMs,
  formatMultiplier,
  formatRate,
} from '../lib/operator-format';

const DIMENSIONS: readonly ObservabilityDimension[] = ['route', 'model', 'user', 'tenant'];
const USER_DIMENSION: ObservabilityDimension = 'user';

const COSTS_ENDPOINT = '/api/operator?view=costs';
const OBSERVABILITY_ENDPOINT = '/api/admin/observability';
const EXPLAIN_ENDPOINT = '/api/admin/observability/explain';

const CARD_CLASS = 'rounded-2xl border border-border bg-card p-5';
const TABLE_WRAP_CLASS = 'overflow-x-auto rounded-2xl border border-border';
const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-foreground/40';
const GHOST_BUTTON_CLASS =
  'rounded-full border border-border px-3 py-1 text-xs transition-colors hover:border-foreground/30 disabled:opacity-50';

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }
  return body as T;
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function CostWindowCard({ costWindow }: { costWindow: OperatorCostWindow }) {
  const noSpend = costWindow.cogs.providerCostCents === 0 && costWindow.activeAccounts === 0;

  return (
    <div className={CARD_CLASS}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">Last {costWindow.days} days</h3>
        <span className="text-xs text-muted-foreground">
          {formatDateTime(costWindow.from)} to {formatDateTime(costWindow.to)}
        </span>
      </div>
      {noSpend ? (
        <p className="mt-4 text-sm text-muted-foreground">
          The cost ledger recorded no provider spend in this window. Rows appear here once a
          completion, image, transcription or search call settles against a provider.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Figure label="Inference cost" value={formatCents(costWindow.cogs.providerCostCents)} />
          <Figure label="Billed" value={formatCents(costWindow.cogs.billedCents)} />
          <Figure label="Gross margin" value={formatCents(costWindow.cogs.grossMarginCents)} />
          <Figure
            label="Cost per active account"
            value={formatCents(costWindow.costPerActiveAccountCents)}
            sub={`${formatCount(costWindow.activeAccounts)} account(s) with recorded cost; ${formatCents(costWindow.costWithNoAccountCents)} carried no account and is outside this figure`}
          />
          <Figure
            label="Cost per delivered task"
            value={formatCents(costWindow.tasks.costPerDeliveredTaskCents)}
            sub={`${formatCount(costWindow.tasks.deliveredTasks)} delivered`}
          />
          <Figure
            label="Cache savings"
            value={formatCents(costWindow.cogs.cacheSavingsCents)}
            sub={`write premium ${formatCents(costWindow.cogs.cacheWritePremiumCents)}`}
          />
          <Figure
            label="Undelivered cost"
            value={formatCents(costWindow.tasks.undeliveredCostCents)}
            sub={`${formatCount(costWindow.tasks.undeliveredEvents)} event(s) charged with nothing shipped`}
          />
          <Figure
            label="Repeat cost"
            value={formatCents(costWindow.tasks.repeatCostCents)}
            sub={`${formatCount(costWindow.tasks.repeatedTasks)} task(s) run more than once`}
          />
          <Figure
            label="Unattributed cost"
            value={formatCents(costWindow.tasks.unattributedCostCents)}
            sub="no task reference on the ledger event"
          />
        </div>
      )}
    </div>
  );
}

export default function OperatorCostsPanel() {
  const [costs, setCosts] = useState<OperatorCosts | null>(null);
  const [costsError, setCostsError] = useState<string | null>(null);
  const [dimension, setDimension] = useState<ObservabilityDimension>(DIMENSIONS[0]!);
  const [rows, setRows] = useState<ObservabilityMetricsRow[] | null>(null);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [explainUserId, setExplainUserId] = useState('');
  const [explainKey, setExplainKey] = useState('');
  const [explain, setExplain] = useState<RequestExplain | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);

  const loadCosts = useCallback(async () => {
    setCostsError(null);
    try {
      const body = await readJson<{ costs: OperatorCosts }>(COSTS_ENDPOINT);
      setCosts(body.costs);
    } catch (error) {
      setCostsError(toUserMessage(error, 'Could not load the cost ledger.'));
    }
  }, []);

  const loadBreakdown = useCallback(async (value: ObservabilityDimension) => {
    setRows(null);
    setRowsError(null);
    try {
      const body = await readJson<{ rows: ObservabilityMetricsRow[] }>(
        `${OBSERVABILITY_ENDPOINT}?dimension=${value}`,
      );
      setRows(body.rows);
    } catch (error) {
      setRowsError(toUserMessage(error, 'Could not load the cost breakdown.'));
    }
  }, []);

  useEffect(() => {
    void loadCosts();
  }, [loadCosts]);

  useEffect(() => {
    void loadBreakdown(dimension);
  }, [dimension, loadBreakdown]);

  async function runExplain() {
    const userId = explainUserId.trim();
    const idempotencyKey = explainKey.trim();
    if (!userId || !idempotencyKey) {
      setExplainError('A user id and an idempotency key identify one request.');
      return;
    }
    setExplaining(true);
    setExplainError(null);
    setExplain(null);
    try {
      const body = await readJson<{ explain: RequestExplain }>(
        `${EXPLAIN_ENDPOINT}?userId=${encodeURIComponent(userId)}&idempotencyKey=${encodeURIComponent(idempotencyKey)}`,
      );
      setExplain(body.explain);
    } catch (error) {
      setExplainError(toUserMessage(error, 'Could not explain that request.'));
    } finally {
      setExplaining(false);
    }
  }

  return (
    <section className="flex flex-col gap-5" aria-labelledby="operator-costs-title">
      <h2 id="operator-costs-title" className="sr-only">
        Costs
      </h2>

      {costsError ? (
        <p role="alert" className="text-sm text-danger">
          {costsError}
        </p>
      ) : null}

      {costs ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {costs.windows.map((costWindow) => (
            <CostWindowCard key={costWindow.days} costWindow={costWindow} />
          ))}
        </div>
      ) : costsError ? null : (
        <div className={`${CARD_CLASS} flex items-center gap-3`}>
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">Reading the cost ledger…</span>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium">Cost breakdown, last 24 hours</h3>
          <div role="tablist" aria-label="Cost breakdown dimension" className="flex gap-2">
            {DIMENSIONS.map((value) => (
              <button
                key={value}
                role="tab"
                aria-selected={dimension === value}
                onClick={() => setDimension(value)}
                className={`rounded-full border px-3 py-1 text-xs capitalize transition-colors ${
                  dimension === value
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-card hover:border-foreground/20'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        {rowsError ? (
          <p role="alert" className="text-sm text-danger">
            {rowsError}
          </p>
        ) : rows === null ? (
          <div className={`${CARD_CLASS} flex items-center gap-3`}>
            <Spinner size="sm" />
            <span className="text-sm text-muted-foreground">Reading the breakdown…</span>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No provider cost event was recorded in the last 24 hours, so there is nothing to break
            down by {dimension}.
          </p>
        ) : (
          <div className={TABLE_WRAP_CLASS}>
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-card text-left">
                <tr>
                  <th className="p-3 font-medium capitalize">{dimension}</th>
                  <th className="p-3 font-medium">Requests</th>
                  <th className="p-3 font-medium">Cache hit</th>
                  <th className="p-3 font-medium">Actual</th>
                  <th className="p-3 font-medium">Retail</th>
                  <th className="p-3 font-medium">Value</th>
                  <th className="p-3 font-medium">Fallbacks</th>
                  <th className="p-3 font-medium">p50 / p95</th>
                  {dimension === USER_DIMENSION ? (
                    <th className="p-3 font-medium">Explain</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-t border-border">
                    <td className="max-w-xs truncate p-3 font-mono text-xs">{row.key}</td>
                    <td className="p-3 tabular-nums">{formatCount(row.requests)}</td>
                    <td className="p-3 tabular-nums">{formatRate(row.cacheHitRate)}</td>
                    <td className="p-3 tabular-nums">{formatCents(row.actualCostCents)}</td>
                    <td className="p-3 tabular-nums">{formatCents(row.retailCostCents)}</td>
                    <td className="p-3 tabular-nums">{formatMultiplier(row.valueMultiplier)}</td>
                    <td className="p-3 tabular-nums">{formatCount(row.fallbackCount)}</td>
                    <td className="p-3 tabular-nums">
                      {formatLatencyMs(row.latencyP50Ms)} / {formatLatencyMs(row.latencyP95Ms)}
                    </td>
                    {dimension === USER_DIMENSION ? (
                      <td className="p-3">
                        <button
                          onClick={() => setExplainUserId(row.key)}
                          className={GHOST_BUTTON_CLASS}
                        >
                          Use this account
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={CARD_CLASS}>
        <h3 className="text-sm font-medium">Explain one request</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          The breakdown above aggregates; this answers what one request actually did, which route
          served it, whether it fell back and why, and what it cost against retail.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Account id
            <input
              value={explainUserId}
              onChange={(event) => setExplainUserId(event.target.value)}
              className={FIELD_CLASS}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Idempotency key
            <input
              value={explainKey}
              onChange={(event) => setExplainKey(event.target.value)}
              className={FIELD_CLASS}
            />
          </label>
          <button
            onClick={() => void runExplain()}
            disabled={explaining}
            className="rounded-full border border-border px-4 py-2 text-xs transition-colors hover:border-foreground/30 disabled:opacity-50"
          >
            {explaining ? 'Explaining…' : 'Explain'}
          </button>
        </div>

        {explainError ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {explainError}
          </p>
        ) : null}

        {explain ? (
          <dl className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Served route</dt>
              <dd className="mt-1 font-mono text-xs">{explain.routeId}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Fell back</dt>
              <dd className="mt-1 text-sm">
                {explain.fallbackOccurred ? (explain.fallbackReason ?? 'yes') : 'no'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Status</dt>
              <dd className="mt-1 text-sm">{explain.status}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Actual cost</dt>
              <dd className="mt-1 text-sm tabular-nums">{formatCents(explain.actualCostCents)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Retail cost</dt>
              <dd className="mt-1 text-sm tabular-nums">{formatCents(explain.retailCostCents)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Latency</dt>
              <dd className="mt-1 text-sm tabular-nums">{formatLatencyMs(explain.latencyMs)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Cache read / write tokens</dt>
              <dd className="mt-1 text-sm tabular-nums">
                {formatCount(explain.cacheReadTokens)} / {formatCount(explain.cacheWriteTokens)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Input tokens</dt>
              <dd className="mt-1 text-sm tabular-nums">{formatCount(explain.inputTokens)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Received</dt>
              <dd className="mt-1 text-sm">{formatDateTime(explain.createdAt)}</dd>
            </div>
          </dl>
        ) : null}
      </div>
    </section>
  );
}
