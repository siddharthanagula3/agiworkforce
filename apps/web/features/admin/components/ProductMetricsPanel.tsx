'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';
import {
  MICROUSD_PER_USD,
  PRODUCT_METRIC_KEYS,
  type ProductMetricKey,
  type ProductMetricValue,
} from '@agiworkforce/types';

import { toUserMessage } from '@/lib/user-error-message';
import type { ProductMetricsSummary } from '../services/product-metrics';
import { formatCount, formatDateTime, formatRate } from '../lib/operator-format';

const PRODUCT_METRICS_ENDPOINT = '/api/admin/product-metrics';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 30;
const MONEY_FRACTION_DIGITS = 2;

const CARD_CLASS = 'rounded-2xl border border-border bg-card p-5';
const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-foreground/40';
const CONTROL_LABEL_CLASS = 'flex flex-col gap-1 text-xs text-muted-foreground';

/**
 * A ratio whose denominator is zero. The service reports null rather than a
 * number, and so does this panel: "0.0%" over no population reads as a result
 * that was measured and came back bad.
 */
const NOTHING_TO_MEASURE = 'nothing to measure';

type MetricShape = 'count' | 'rate' | 'money';

interface MetricDescriptor {
  readonly label: string;
  readonly shape: MetricShape;
  readonly meaning: string;
}

const METRIC_DESCRIPTOR: Record<ProductMetricKey, MetricDescriptor> = {
  dau: {
    label: 'Daily active',
    shape: 'count',
    meaning: 'Accounts that produced an event in the 24 hours before the window closes.',
  },
  wau: {
    label: 'Weekly active',
    shape: 'count',
    meaning: 'Accounts that produced an event in the 7 days before the window closes.',
  },
  mau: {
    label: 'Monthly active',
    shape: 'count',
    meaning: 'Accounts that produced an event in the 30 days before the window closes.',
  },
  retention_d1: {
    label: 'Day 1 retention',
    shape: 'rate',
    meaning: 'Of one day’s signups, the share that came back the next day.',
  },
  retention_d7: {
    label: 'Day 7 retention',
    shape: 'rate',
    meaning: 'Of one day’s signups, the share that came back on day 7.',
  },
  retention_d30: {
    label: 'Day 30 retention',
    shape: 'rate',
    meaning: 'Of one day’s signups, the share that came back on day 30.',
  },
  paid_conversion: {
    label: 'Paid conversion',
    shape: 'rate',
    meaning: 'Signups inside the window that now hold an active paid subscription.',
  },
  churn: {
    label: 'Churn',
    shape: 'rate',
    meaning: 'Subscriptions cancelled in the window, against the paid base at its start.',
  },
  expansion: {
    label: 'Expansion',
    shape: 'rate',
    meaning: 'Monthly revenue added by upgrades in the window, against current MRR.',
  },
  arr_microusd: {
    label: 'ARR',
    shape: 'money',
    meaning: 'Current MRR from the active paid plan mix, annualised.',
  },
  arpu_microusd: {
    label: 'ARPU',
    shape: 'money',
    meaning: 'Cash revenue in the window divided by monthly active accounts.',
  },
  gross_margin: {
    label: 'Gross margin',
    shape: 'rate',
    meaning: 'Revenue less cost of goods, against revenue.',
  },
  support_cost_microusd: {
    label: 'Support cost',
    shape: 'money',
    meaning: 'Support adjustments booked against cost of goods in the window.',
  },
  paid_subscribers: {
    label: 'Paid subscribers',
    shape: 'count',
    meaning: 'Accounts on an active paid plan.',
  },
  regenerate_rate: {
    label: 'Regenerate rate',
    shape: 'rate',
    meaning: 'Assistant responses the reader asked to be produced again.',
  },
  stop_rate: {
    label: 'Stop rate',
    shape: 'rate',
    meaning: 'Assistant responses the reader stopped mid-generation.',
  },
  tool_failure_rate: {
    label: 'Tool failure rate',
    shape: 'rate',
    meaning: 'Tool calls that ended in failure.',
  },
  tool_retry_rate: {
    label: 'Tool retry rate',
    shape: 'rate',
    meaning: 'Tool calls that were a second or later attempt.',
  },
  citation_failure_rate: {
    label: 'Citation failure rate',
    shape: 'rate',
    meaning: 'Citations that could not be rendered.',
  },
  file_failure_rate: {
    label: 'File failure rate',
    shape: 'rate',
    meaning: 'Uploaded files that could not be processed.',
  },
  code_acceptance_rate: {
    label: 'Code acceptance rate',
    shape: 'rate',
    meaning: 'Code suggestions the reader accepted rather than discarded.',
  },
  work_completion_rate: {
    label: 'Work completion rate',
    shape: 'rate',
    meaning: 'Work runs that finished successfully.',
  },
  research_completion_rate: {
    label: 'Research completion rate',
    shape: 'rate',
    meaning: 'Research runs that finished successfully.',
  },
  browser_success_rate: {
    label: 'Browser success rate',
    shape: 'rate',
    meaning: 'Browser actions that finished successfully.',
  },
  remote_success_rate: {
    label: 'Remote success rate',
    shape: 'rate',
    meaning: 'Remote device actions that finished successfully.',
  },
};

interface MetricGroup {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly metrics: readonly ProductMetricKey[];
}

const METRIC_GROUPS: readonly MetricGroup[] = [
  {
    id: 'engagement',
    title: 'Engagement',
    description: 'Distinct accounts in the event stream, counted back from the end of the window.',
    metrics: ['dau', 'wau', 'mau'],
  },
  {
    id: 'retention',
    title: 'Retention',
    description:
      'Each cohort is one day of signups, chosen far enough back that its window has already closed.',
    metrics: ['retention_d1', 'retention_d7', 'retention_d30'],
  },
  {
    id: 'revenue',
    title: 'Funnel and revenue',
    description:
      'Signups, subscriptions and the economics summary. Money is cash, not recognised revenue.',
    metrics: [
      'paid_conversion',
      'churn',
      'expansion',
      'arr_microusd',
      'arpu_microusd',
      'gross_margin',
      'support_cost_microusd',
      'paid_subscribers',
    ],
  },
  {
    id: 'quality',
    title: 'Answer quality',
    description: 'Every rate is measured from the events the product already writes as it runs.',
    metrics: [
      'regenerate_rate',
      'stop_rate',
      'tool_failure_rate',
      'tool_retry_rate',
      'citation_failure_rate',
      'file_failure_rate',
      'code_acceptance_rate',
      'work_completion_rate',
      'research_completion_rate',
      'browser_success_rate',
      'remote_success_rate',
    ],
  },
];

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatUsd(microusd: number | null): string {
  if (microusd === null || !Number.isFinite(microusd)) return NOTHING_TO_MEASURE;
  return (microusd / MICROUSD_PER_USD).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: MONEY_FRACTION_DIGITS,
  });
}

function formatMetric(entry: ProductMetricValue, shape: MetricShape): string {
  if (shape === 'count') return formatCount(entry.numerator);
  if (entry.value === null) return NOTHING_TO_MEASURE;
  return shape === 'money' ? formatUsd(entry.value) : formatRate(entry.value);
}

function describeBasis(entry: ProductMetricValue, shape: MetricShape): string | null {
  if (shape === 'count' || entry.denominator === 0) return null;
  return `${formatCount(entry.numerator)} of ${formatCount(entry.denominator)}`;
}

async function readSummary(from: string, to: string): Promise<ProductMetricsSummary> {
  const params = new URLSearchParams({ from, to });
  const response = await fetch(`${PRODUCT_METRICS_ENDPOINT}?${params.toString()}`, {
    cache: 'no-store',
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }
  return body as ProductMetricsSummary;
}

function MetricCard({ entry }: { entry: ProductMetricValue }) {
  const descriptor = METRIC_DESCRIPTOR[entry.metric];
  const basis = describeBasis(entry, descriptor.shape);
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="text-xs text-muted-foreground">{descriptor.label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {formatMetric(entry, descriptor.shape)}
      </p>
      {basis ? <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{basis}</p> : null}
      <p className="mt-1 text-xs text-muted-foreground">{descriptor.meaning}</p>
    </div>
  );
}

export default function ProductMetricsPanel() {
  const now = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(() =>
    isoDay(new Date(now.getTime() - DEFAULT_WINDOW_DAYS * MS_PER_DAY)),
  );
  const [to, setTo] = useState(() => isoDay(now));
  const [summary, setSummary] = useState<ProductMetricsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setSummary(await readSummary(from, to));
    } catch (loadError) {
      setSummary(null);
      setError(toUserMessage(loadError, 'Could not read the product metrics.'));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const byKey = useMemo(() => {
    const map = new Map<ProductMetricKey, ProductMetricValue>();
    for (const entry of summary?.metrics ?? []) map.set(entry.metric, entry);
    return map;
  }, [summary]);

  const unexpected = useMemo(
    () =>
      (summary?.metrics ?? [])
        .map((entry) => entry.metric)
        .filter(
          (metric) =>
            !METRIC_GROUPS.some((group) => group.metrics.includes(metric)) &&
            (PRODUCT_METRIC_KEYS as readonly string[]).includes(metric),
        ),
    [summary],
  );

  return (
    <section className="flex flex-col gap-4" aria-labelledby="product-metrics-title">
      <div>
        <h2 id="product-metrics-title" className="text-sm font-medium">
          Product metrics
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Engagement, retention, the paid funnel and answer quality, each computed from rows the
          product already holds. A ratio with no population reports {NOTHING_TO_MEASURE} rather than
          a zero that would read as a result.
        </p>
      </div>

      <div className={`${CARD_CLASS} grid gap-3 sm:grid-cols-2`}>
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
          <span className="text-sm text-muted-foreground">Measuring the window…</span>
        </div>
      ) : summary === null ? null : summary.metrics.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing was measured over this window. Widen it, or check that product analytics ingest is
          running.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {formatDateTime(summary.from)} to {formatDateTime(summary.to)}
          </p>

          {METRIC_GROUPS.map((group) => {
            const entries = group.metrics
              .map((metric) => byKey.get(metric))
              .filter((entry): entry is ProductMetricValue => entry !== undefined);
            if (entries.length === 0) return null;
            return (
              <section
                key={group.id}
                className={CARD_CLASS}
                aria-labelledby={`product-metrics-${group.id}`}
              >
                <h3 id={`product-metrics-${group.id}`} className="text-sm font-medium">
                  {group.title}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">{group.description}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {entries.map((entry) => (
                    <MetricCard key={entry.metric} entry={entry} />
                  ))}
                </div>
              </section>
            );
          })}

          {unexpected.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {unexpected.length} metric(s) arrived that this panel does not group yet:{' '}
              {unexpected.join(', ')}.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
