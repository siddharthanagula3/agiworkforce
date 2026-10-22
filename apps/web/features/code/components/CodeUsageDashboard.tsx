'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Spinner, Tabs, TabsContent, TabsList, TabsTrigger } from '@agiworkforce/ui';
import {
  formatCredits,
  getModelMetadataById,
  isFreeBillingPlanTier,
  parseAccountUsageHistoryResponse,
  type AccountUsageBreakdownRow,
  type AccountUsageHistoryResponse,
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
type CodeUsageTab = 'overview' | 'models';

const DEFAULT_RANGE: CodeUsageRange = '30d';

const COPY = {
  label: 'Code usage',
  overview: 'Overview',
  models: 'Models',
  rangeLabel: 'Usage range',
  requests: 'Requests',
  tokens: 'Total tokens',
  credits: 'Credits used',
  topModel: 'Top model',
  model: 'Model',
  loading: 'Loading usage',
  empty: 'No Code usage in this period.',
  failed: 'Usage could not load.',
  retry: 'Retry loading usage',
} as const;

const PILL =
  'min-h-8 rounded-full px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11';
const PILL_IDLE = 'text-muted-foreground hover:bg-accent hover:text-accent-foreground';
const PILL_ACTIVE = 'bg-accent text-accent-foreground';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; history: AccountUsageHistoryResponse };

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

function modelLabel(row: AccountUsageBreakdownRow): string {
  return row.label ?? getModelMetadataById(row.key)?.name ?? row.key;
}

function Overview({ history }: { history: AccountUsageHistoryResponse }) {
  const { totals } = history;
  const top = history.byModel[0];
  const tiles = [
    { label: COPY.requests, value: totals.requests.toLocaleString() },
    { label: COPY.tokens, value: compactNumber.format(totals.inputTokens + totals.outputTokens) },
    { label: COPY.credits, value: formatCreditAmount(totals.credits) },
    ...(top ? [{ label: COPY.topModel, value: modelLabel(top) }] : []),
  ];
  return (
    <dl className="m-0 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="flex min-w-0 flex-col gap-1 rounded-lg bg-muted px-3 py-2">
          <dt className="text-sm text-muted-foreground">{tile.label}</dt>
          <dd className="m-0 truncate text-base font-medium text-foreground">{tile.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Models({ rows }: { rows: readonly AccountUsageBreakdownRow[] }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th scope="col" className="py-2 font-normal">
            {COPY.model}
          </th>
          <th scope="col" className="py-2 text-right font-normal">
            {COPY.requests}
          </th>
          <th scope="col" className="py-2 text-right font-normal">
            {COPY.credits}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-t border-border text-foreground">
            <th scope="row" className="max-w-0 truncate py-2 text-left font-normal">
              {modelLabel(row)}
            </th>
            <td className="py-2 text-right tabular-nums">{row.requests.toLocaleString()}</td>
            <td className="py-2 text-right tabular-nums">{formatCreditAmount(row.credits)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CodeUsageDashboard({ planTier }: { planTier: string | null }) {
  const metered = planTier !== null && !isFreeBillingPlanTier(planTier);
  const [tab, setTab] = useState<CodeUsageTab>('overview');
  const [range, setRange] = useState<CodeUsageRange>(DEFAULT_RANGE);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!metered) return;
    const controller = new AbortController();
    setState({ status: 'loading' });
    const query = new URLSearchParams({
      granularity: 'day',
      workload: CODE_WORKLOAD,
      from: rangeStart(range, Date.now()),
    });
    void (async () => {
      try {
        const response = await fetch(`${USAGE_HISTORY_URL}?${query}`, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(COPY.failed);
        const history = parseAccountUsageHistoryResponse(await response.json());
        if (!history) throw new Error(COPY.failed);
        if (!controller.signal.aborted) setState({ status: 'ready', history });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: toUserMessage(error, COPY.failed) });
      }
    })();
    return () => controller.abort();
  }, [metered, range, attempt]);

  if (!metered) return null;

  const history =
    state.status === 'ready' && state.history.totals.requests > 0 ? state.history : null;

  return (
    <section
      aria-label={COPY.label}
      data-testid="code-usage-dashboard"
      className="mt-8 rounded-xl border border-border bg-card p-4 text-left"
    >
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as CodeUsageTab)}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="h-auto gap-1 bg-transparent p-0">
            <TabsTrigger
              value="overview"
              className={`${PILL} ${PILL_IDLE} py-0 font-normal data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-none`}
            >
              {COPY.overview}
            </TabsTrigger>
            <TabsTrigger
              value="models"
              className={`${PILL} ${PILL_IDLE} py-0 font-normal data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-none`}
            >
              {COPY.models}
            </TabsTrigger>
          </TabsList>
          <div role="group" aria-label={COPY.rangeLabel} className="flex items-center gap-1">
            {CODE_USAGE_RANGES.map((option) => {
              const selected = option.value === range;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setRange(option.value)}
                  className={`${PILL} ${selected ? PILL_ACTIVE : PILL_IDLE}`}
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
              className={`${PILL} border border-border text-foreground hover:bg-accent`}
            >
              {COPY.retry}
            </button>
          </div>
        )}

        {state.status === 'ready' && !history && (
          <p className="m-0 text-sm text-muted-foreground">{COPY.empty}</p>
        )}

        {history && (
          <>
            <TabsContent value="overview" className="mt-0">
              <Overview history={history} />
            </TabsContent>
            <TabsContent value="models" className="mt-0">
              <Models rows={history.byModel} />
            </TabsContent>
          </>
        )}

        <Link
          href={CODE_ROUTES.usage}
          className="self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {CODE_COPY.usageDetail}
        </Link>
      </Tabs>
    </section>
  );
}
