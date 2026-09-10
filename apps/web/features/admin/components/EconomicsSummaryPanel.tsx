'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';

import { toUserMessage } from '@/lib/user-error-message';
import type {
  CogsClass,
  EconomicsGrouping,
  EconomicsSummary,
  EconomicsSummaryGroup,
} from '../services/economics-summary';
import { formatCount, UNKNOWN } from '../lib/operator-format';

const ECONOMICS_ENDPOINT = '/api/admin/economics';
const MICROUSD_PER_USD = 1_000_000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 30;
const PERCENT_SCALE = 100;
const RATIO_DIGITS = 2;

const CARD_CLASS = 'rounded-2xl border border-border bg-card p-5';
const TABLE_WRAP_CLASS = 'overflow-x-auto rounded-2xl border border-border';
const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-foreground/40';
const CONTROL_LABEL_CLASS = 'flex flex-col gap-1 text-xs text-muted-foreground';
const CELL_CLASS = 'p-3 align-top';
const NUMERIC_CELL_CLASS = 'p-3 align-top tabular-nums';
const HEADER_CELL_CLASS = 'p-3 font-medium';

const GROUPING_LABEL: Record<EconomicsGrouping, string> = {
  total: 'Total',
  plan: 'Plan',
  model: 'Model',
  provider: 'Provider',
  route: 'Route',
  feature: 'Feature',
  surface: 'Surface',
};

const COGS_CLASS_LABEL: Record<CogsClass, string> = {
  model: 'Model',
  search: 'Search',
  sandbox: 'Sandbox',
  voice: 'Voice',
  media: 'Image and video',
};

const GROUPINGS = Object.keys(GROUPING_LABEL) as EconomicsGrouping[];
const COGS_CLASSES = Object.keys(COGS_CLASS_LABEL) as CogsClass[];

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatUsd(microusd: number | null): string {
  if (microusd === null) return UNKNOWN;
  return (microusd / MICROUSD_PER_USD).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number | null): string {
  if (value === null) return UNKNOWN;
  return `${(value * PERCENT_SCALE).toFixed(1)}%`;
}

function formatRatio(value: number | null): string {
  if (value === null) return UNKNOWN;
  return `${value.toFixed(RATIO_DIGITS)}×`;
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }
  return body as T;
}

function GroupRow({ group, emphasis }: { group: EconomicsSummaryGroup; emphasis: boolean }) {
  return (
    <tr className={`border-t border-border ${emphasis ? 'font-medium' : ''}`}>
      <td className={CELL_CLASS}>{group.key}</td>
      <td className={NUMERIC_CELL_CLASS}>{formatCount(group.events)}</td>
      <td className={NUMERIC_CELL_CLASS}>{formatUsd(group.canonicalValueMicrousd)}</td>
      <td className={NUMERIC_CELL_CLASS}>{formatCount(group.canonicalValueCredits)}</td>
      <td className={NUMERIC_CELL_CLASS}>{formatUsd(group.cogs.totalMicrousd)}</td>
      {COGS_CLASSES.map((cogsClass) => (
        <td key={cogsClass} className={NUMERIC_CELL_CLASS}>
          {formatUsd(group.cogs.byClassMicrousd[cogsClass])}
        </td>
      ))}
      <td className={NUMERIC_CELL_CLASS}>{formatUsd(group.paymentFeesMicrousd)}</td>
      <td className={NUMERIC_CELL_CLASS}>{formatUsd(group.storeCommission.totalMicrousd)}</td>
      <td className={NUMERIC_CELL_CLASS}>
        {group.revenue ? formatUsd(group.revenue.cashMicrousd) : UNKNOWN}
      </td>
      <td className={NUMERIC_CELL_CLASS}>{formatUsd(group.contributionMicrousd)}</td>
      <td className={NUMERIC_CELL_CLASS}>{formatPercent(group.contributionMargin)}</td>
      <td className={NUMERIC_CELL_CLASS}>{formatRatio(group.canonicalValueToCogsRatio)}</td>
    </tr>
  );
}

export default function EconomicsSummaryPanel() {
  const now = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(() =>
    isoDay(new Date(now.getTime() - DEFAULT_WINDOW_DAYS * MS_PER_DAY)),
  );
  const [to, setTo] = useState(() => isoDay(now));
  const [groupBy, setGroupBy] = useState<EconomicsGrouping>('total');
  const [summary, setSummary] = useState<EconomicsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to, group_by: groupBy });
      setSummary(await readJson<EconomicsSummary>(`${ECONOMICS_ENDPOINT}?${params.toString()}`));
    } catch (loadError) {
      setError(toUserMessage(loadError, 'Could not read the economics summary.'));
    } finally {
      setLoading(false);
    }
  }, [from, to, groupBy]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = summary?.groups ?? [];
  const reconciliation = summary?.reconciliation;

  return (
    <div className="flex flex-col gap-4">
      <div className={`${CARD_CLASS} grid gap-3 sm:grid-cols-3`}>
        <label className={CONTROL_LABEL_CLASS}>
          From
          <input
            type="date"
            className={FIELD_CLASS}
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className={CONTROL_LABEL_CLASS}>
          To
          <input
            type="date"
            className={FIELD_CLASS}
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <label className={CONTROL_LABEL_CLASS}>
          Breakdown
          <select
            className={FIELD_CLASS}
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value as EconomicsGrouping)}
          >
            {GROUPINGS.map((grouping) => (
              <option key={grouping} value={grouping}>
                {GROUPING_LABEL[grouping]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive-text">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2">
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">Reading the economics summary…</span>
        </div>
      ) : null}

      {summary ? (
        <>
          <p className="text-xs text-muted-foreground">
            Subscription revenue basis: {summary.subscriptionRevenueBasis}. Store commission is an
            estimate from the published Apple and Google rates. Legacy ledger rows without a
            customer figure: {formatCount(summary.totals.legacyRows)}.
          </p>

          <div className={TABLE_WRAP_CLASS}>
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className={HEADER_CELL_CLASS}>{GROUPING_LABEL[summary.groupBy]}</th>
                  <th className={HEADER_CELL_CLASS}>Events</th>
                  <th className={HEADER_CELL_CLASS}>Canonical value</th>
                  <th className={HEADER_CELL_CLASS}>Credits</th>
                  <th className={HEADER_CELL_CLASS}>COGS</th>
                  {COGS_CLASSES.map((cogsClass) => (
                    <th key={cogsClass} className={HEADER_CELL_CLASS}>
                      {COGS_CLASS_LABEL[cogsClass]}
                    </th>
                  ))}
                  <th className={HEADER_CELL_CLASS}>Payment fees</th>
                  <th className={HEADER_CELL_CLASS}>Store commission</th>
                  <th className={HEADER_CELL_CLASS}>Cash revenue</th>
                  <th className={HEADER_CELL_CLASS}>Contribution</th>
                  <th className={HEADER_CELL_CLASS}>Margin</th>
                  <th className={HEADER_CELL_CLASS}>Value to COGS</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <GroupRow key={group.key} group={group} emphasis={false} />
                ))}
                <GroupRow group={summary.totals} emphasis />
              </tbody>
            </table>
          </div>

          <div className={CARD_CLASS}>
            <h3 className="text-sm font-medium">Provider reconciliation</h3>
            {reconciliation?.available ? (
              reconciliation.gaps.length > 0 ? (
                <div className={`${TABLE_WRAP_CLASS} mt-3`}>
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="bg-muted/40 text-left">
                      <tr>
                        <th className={HEADER_CELL_CLASS}>Provider</th>
                        <th className={HEADER_CELL_CLASS}>Day</th>
                        <th className={HEADER_CELL_CLASS}>Source</th>
                        <th className={HEADER_CELL_CLASS}>Reported</th>
                        <th className={HEADER_CELL_CLASS}>Ledger</th>
                        <th className={HEADER_CELL_CLASS}>Gap</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reconciliation.gaps.map((gap) => (
                        <tr
                          key={`${gap.provider}-${gap.day}-${gap.source}`}
                          className="border-t border-border"
                        >
                          <td className={CELL_CLASS}>{gap.provider}</td>
                          <td className={CELL_CLASS}>{gap.day}</td>
                          <td className={CELL_CLASS}>{gap.source}</td>
                          <td className={NUMERIC_CELL_CLASS}>{formatUsd(gap.reportedMicrousd)}</td>
                          <td className={NUMERIC_CELL_CLASS}>{formatUsd(gap.ledgerMicrousd)}</td>
                          <td className={NUMERIC_CELL_CLASS}>{formatUsd(gap.gapMicrousd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  No provider has reported a cost for this period yet.
                </p>
              )
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Provider reports are unavailable: the reconciliation table is not present in this
                database.
              </p>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
