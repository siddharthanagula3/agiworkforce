'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Spinner } from '@agiworkforce/ui';
import {
  formatCredits,
  isFreeBillingPlanTier,
  parseAccountUsageHistoryResponse,
  type AccountUsageBreakdownRow,
} from '@agiworkforce/types';
import type { UsageWorkload } from '@/lib/billing/usage-attribution';
import { toUserMessage } from '@/lib/user-error-message';
import { CODE_COPY, CODE_ROUTES } from '../code-surface';

const CODE_WORKLOAD: UsageWorkload = 'code';
const USAGE_HISTORY_URL = '/api/usage/history';
const DAY_MS = 24 * 60 * 60 * 1000;

const CODE_USAGE_RANGES = [
  { value: '7d', label: '7d', days: 7 },
  { value: '30d', label: '30d', days: 30 },
  { value: '1y', label: '1y', days: 365 },
] as const;

type CodeUsageRange = (typeof CODE_USAGE_RANGES)[number]['value'];

const DEFAULT_RANGE: CodeUsageRange = '30d';

const COPY = {
  heading: 'Usage',
  rangeLabel: 'Usage range',
  requests: 'Requests',
  tokens: 'Total tokens',
  credits: 'Credits used',
  loading: 'Loading usage',
  empty: 'No Code usage in this period.',
  failed: 'Usage could not load.',
  retry: 'Retry loading usage',
} as const;

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; row: AccountUsageBreakdownRow | null };

const compactNumber = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

function formatCreditAmount(value: number): string {
  return formatCredits(value, { maximumFractionDigits: value > 0 && value < 10 ? 2 : 1 });
}

function rangeStart(range: CodeUsageRange, now: number): string {
  const days = CODE_USAGE_RANGES.find((option) => option.value === range)?.days ?? 30;
  return new Date(now - days * DAY_MS).toISOString();
}

export function CodeUsageDashboard({ planTier }: { planTier: string | null }) {
  const metered = planTier !== null && !isFreeBillingPlanTier(planTier);
  const [range, setRange] = useState<CodeUsageRange>(DEFAULT_RANGE);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!metered) return;
    const controller = new AbortController();
    setState({ status: 'loading' });
    const query = new URLSearchParams({ granularity: 'day', from: rangeStart(range, Date.now()) });
    void (async () => {
      try {
        const response = await fetch(`${USAGE_HISTORY_URL}?${query}`, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(COPY.failed);
        const history = parseAccountUsageHistoryResponse(await response.json());
        if (!history) throw new Error(COPY.failed);
        const row = history.byWorkload.find((entry) => entry.key === CODE_WORKLOAD) ?? null;
        if (!controller.signal.aborted) setState({ status: 'ready', row });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: toUserMessage(error, COPY.failed) });
      }
    })();
    return () => controller.abort();
  }, [metered, range, attempt]);

  if (!metered) return null;

  const row = state.status === 'ready' ? state.row : null;
  const tiles = row
    ? [
        { label: COPY.requests, value: row.requests.toLocaleString() },
        { label: COPY.tokens, value: compactNumber.format(row.inputTokens + row.outputTokens) },
        { label: COPY.credits, value: formatCreditAmount(row.credits) },
      ]
    : [];

  return (
    <section
      aria-labelledby="code-usage-heading"
      data-testid="code-usage-dashboard"
      className="mt-8 flex flex-col gap-4 rounded-xl border border-border bg-card p-4 text-left"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="code-usage-heading" className="text-sm font-medium text-foreground">
          {COPY.heading}
        </h2>
        <div role="group" aria-label={COPY.rangeLabel} className="flex items-center gap-1">
          {CODE_USAGE_RANGES.map((option) => {
            const selected = option.value === range;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setRange(option.value)}
                className={`min-h-8 rounded-full px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11 ${
                  selected
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {state.status === 'loading' && (
        <div className="flex min-h-16 items-center justify-center">
          <Spinner size="sm" aria-label={COPY.loading} />
        </div>
      )}

      {state.status === 'error' && (
        <div role="alert" className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{state.message}</span>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="min-h-8 rounded-full border border-border px-3 text-sm text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
          >
            {COPY.retry}
          </button>
        </div>
      )}

      {state.status === 'ready' && !row && (
        <p className="m-0 text-sm text-muted-foreground">{COPY.empty}</p>
      )}

      {tiles.length > 0 && (
        <dl className="m-0 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {tiles.map((tile) => (
            <div key={tile.label} className="flex flex-col gap-1 rounded-lg bg-muted px-3 py-2">
              <dt className="text-sm text-muted-foreground">{tile.label}</dt>
              <dd className="m-0 text-base font-medium text-foreground">{tile.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <Link
        href={CODE_ROUTES.usage}
        className="self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {CODE_COPY.usageDetail}
      </Link>
    </section>
  );
}
