'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import {
  FINANCE_OVERVIEW_PATH,
  FINANCE_OVERVIEW_PERIODS,
  parseFinanceOverviewResponse,
  type FinanceAccount,
  type FinanceOverviewPeriod,
  type FinanceOverviewResponse,
} from '@agiworkforce/cloud-contracts';
import { Spinner } from '@agiworkforce/ui';
import { toUserMessage } from '@/lib/user-error-message';
import { LinkedBanks } from './LinkedBanks';

type ReadyOverview = Extract<FinanceOverviewResponse, { status: 'ready' }>;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; overview: FinanceOverviewResponse };

const PERIOD_LABELS: Record<FinanceOverviewPeriod, string> = {
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '12m': 'Last 12 months',
};

const CONNECTIONS_HREF = '/settings/connections';
const LOAD_FAILED = 'Your finances could not be loaded. Try again in a moment.';

function money(value: number | null, currency: string | null): string {
  if (value === null) return 'Not reported';
  if (!currency) return value.toFixed(2);
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function categoryLabel(category: string | null): string {
  if (!category) return 'Other';
  const words = category.toLowerCase().split('_').filter(Boolean).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function monthLabel(month: string): string {
  const [year, monthIndex] = month.split('-').map(Number);
  if (!year || !monthIndex) return month;
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthIndex - 1, 1)));
}

function dayLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? date
    : new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(parsed);
}

function accountLabel(account: FinanceAccount): string {
  return account.mask ? `${account.name} ending in ${account.mask}` : account.name;
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-border/60 bg-card px-5 py-4 text-sm text-foreground"
    >
      {children}
    </div>
  );
}

function ConnectionsLink({ label }: { label: string }) {
  return (
    <Link
      href={CONNECTIONS_HREF}
      className="mt-3 inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
    </Link>
  );
}

function StateNotice({ overview }: { overview: Exclude<FinanceOverviewResponse, ReadyOverview> }) {
  switch (overview.status) {
    case 'unavailable':
      return <Notice>{overview.message}</Notice>;
    case 'not_connected':
      return (
        <Notice>
          <p>Connect a bank account to see your balances and spending here.</p>
          <ConnectionsLink label="Connect a bank account" />
        </Notice>
      );
    case 'preparing':
      return (
        <Notice>
          Your bank is still preparing transaction history for this connection. Check back in a few
          minutes.
        </Notice>
      );
    case 'reconnect':
      return (
        <Notice>
          <p>Your bank asks you to sign in again before it shares new data.</p>
          <ConnectionsLink label="Reconnect bank accounts" />
        </Notice>
      );
  }
}

function Summary({ overview }: { overview: ReadyOverview }) {
  const tiles = [
    { label: 'Spending', value: money(overview.spending.total, overview.currency) },
    { label: 'Income', value: money(overview.income, overview.currency) },
    { label: 'Accounts', value: String(overview.accounts.length) },
  ];
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-lg border border-border/60 bg-card px-4 py-3">
          <dt className="text-xs text-muted-foreground">{tile.label}</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums text-foreground">{tile.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Accounts({ accounts }: { accounts: readonly FinanceAccount[] }) {
  return (
    <section aria-labelledby="finance-accounts" className="space-y-2">
      <h2 id="finance-accounts" className="text-sm font-semibold text-foreground">
        Accounts
      </h2>
      <ul className="divide-y divide-border/60 rounded-lg border border-border/60 bg-card">
        {accounts.map((account) => (
          <li
            key={account.accountId}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {accountLabel(account)}
              </p>
              <p className="text-xs text-muted-foreground">
                {categoryLabel(account.subtype ?? account.type)}
              </p>
            </div>
            <div className="text-end">
              <p className="text-sm font-medium tabular-nums text-foreground">
                {money(account.current, account.currency)}
              </p>
              {account.available !== null && account.available !== account.current ? (
                <p className="text-xs text-muted-foreground">
                  {money(account.available, account.currency)} available
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SpendingByCategory({ overview }: { overview: ReadyOverview }) {
  const top = overview.spending.byCategory[0]?.amount ?? 0;
  return (
    <section aria-labelledby="finance-categories" className="space-y-2">
      <h2 id="finance-categories" className="text-sm font-semibold text-foreground">
        Where your money went
      </h2>
      {overview.spending.byCategory.length === 0 ? (
        <p className="text-sm text-muted-foreground">No spending in this period.</p>
      ) : (
        <ul className="space-y-2 rounded-lg border border-border/60 bg-card px-4 py-3">
          {overview.spending.byCategory.map((entry) => (
            <li key={entry.category} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-foreground">{categoryLabel(entry.category)}</span>
                <span className="tabular-nums text-foreground">
                  {money(entry.amount, overview.currency)}
                  <span className="ms-2 text-xs text-muted-foreground">
                    {entry.transactions === 1 ? '1 purchase' : `${entry.transactions} purchases`}
                  </span>
                </span>
              </div>
              <div aria-hidden="true" className="h-1.5 rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-foreground/70"
                  style={{ width: `${top > 0 ? Math.max(2, (entry.amount / top) * 100) : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ByMonth({ overview }: { overview: ReadyOverview }) {
  if (overview.spending.byMonth.length < 2) return null;
  return (
    <section aria-labelledby="finance-months" className="space-y-2">
      <h2 id="finance-months" className="text-sm font-semibold text-foreground">
        By month
      </h2>
      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-start text-xs text-muted-foreground">
              <th scope="col" className="px-4 py-2 font-medium">
                Month
              </th>
              <th scope="col" className="px-4 py-2 text-end font-medium">
                Spending
              </th>
              <th scope="col" className="px-4 py-2 text-end font-medium">
                Income
              </th>
            </tr>
          </thead>
          <tbody>
            {overview.spending.byMonth.map((entry) => (
              <tr key={entry.month} className="border-t border-border/60">
                <td className="px-4 py-2 text-foreground">{monthLabel(entry.month)}</td>
                <td className="px-4 py-2 text-end tabular-nums text-foreground">
                  {money(entry.spending, overview.currency)}
                </td>
                <td className="px-4 py-2 text-end tabular-nums text-foreground">
                  {money(entry.income, overview.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecentTransactions({ overview }: { overview: ReadyOverview }) {
  const accounts = new Map(overview.accounts.map((account) => [account.accountId, account]));
  return (
    <section aria-labelledby="finance-recent" className="space-y-2">
      <h2 id="finance-recent" className="text-sm font-semibold text-foreground">
        Recent transactions
      </h2>
      {overview.recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">No transactions in this period.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-2 font-medium">
                  Date
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Description
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Category
                </th>
                <th scope="col" className="px-4 py-2 text-end font-medium">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {overview.recent.map((transaction, index) => (
                <tr
                  key={`${transaction.accountId}:${transaction.date}:${index}`}
                  className="border-t border-border/60"
                >
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                    {dayLabel(transaction.date)}
                  </td>
                  <td className="px-4 py-2 text-foreground">
                    <span className="block max-w-xs truncate">{transaction.description}</span>
                    <span className="block text-xs text-muted-foreground">
                      {accounts.get(transaction.accountId)?.name ?? ''}
                      {transaction.pending ? ' · Pending' : ''}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {categoryLabel(transaction.category)}
                  </td>
                  <td
                    className={
                      transaction.amount < 0
                        ? 'whitespace-nowrap px-4 py-2 text-end tabular-nums text-success-text'
                        : 'whitespace-nowrap px-4 py-2 text-end tabular-nums text-foreground'
                    }
                  >
                    {transaction.amount < 0
                      ? `+${money(-transaction.amount, transaction.currency)}`
                      : money(transaction.amount, transaction.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {overview.truncated ? (
        <p className="text-xs text-muted-foreground">
          This period has more transactions than the overview reads, so the totals cover the most
          recent ones.
        </p>
      ) : null}
    </section>
  );
}

export function FinanceDashboard() {
  const [period, setPeriod] = useState<FinanceOverviewPeriod>('30d');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const periodLabelId = useId();

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    void fetch(`${FINANCE_OVERVIEW_PATH}?period=${period}`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        const overview = parseFinanceOverviewResponse(await response.json().catch(() => null));
        if (!response.ok || !overview) throw new Error(LOAD_FAILED);
        setState({ kind: 'loaded', overview });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ kind: 'error', message: toUserMessage(error, LOAD_FAILED) });
      });
    return () => controller.abort();
  }, [period, reloadKey]);

  const overview = state.kind === 'loaded' ? state.overview : null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Finances</h1>
        <p className="text-sm text-muted-foreground">
          A read-only view of the bank accounts you connected. Balances and transactions come from
          your bank through Plaid; nothing here can move money.
        </p>
      </header>

      <div
        role="group"
        aria-labelledby={periodLabelId}
        className="flex flex-wrap items-center gap-2"
      >
        <span id={periodLabelId} className="sr-only">
          Period
        </span>
        {FINANCE_OVERVIEW_PERIODS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={period === option}
            onClick={() => setPeriod(option)}
            className={
              period === option
                ? 'min-h-9 rounded-md border border-foreground bg-foreground px-3 text-sm font-medium text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                : 'min-h-9 rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            }
          >
            {PERIOD_LABELS[option]}
          </button>
        ))}
      </div>

      {state.kind === 'loading' ? (
        <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" aria-hidden="true" />
          Loading your finances
        </div>
      ) : state.kind === 'error' ? (
        <Notice>{state.message}</Notice>
      ) : overview && overview.status === 'ready' ? (
        <>
          <Summary overview={overview} />
          <Accounts accounts={overview.accounts} />
          <LinkedBanks onChanged={() => setReloadKey((key) => key + 1)} />
          <SpendingByCategory overview={overview} />
          <ByMonth overview={overview} />
          <RecentTransactions overview={overview} />
        </>
      ) : overview ? (
        <StateNotice overview={overview} />
      ) : null}
    </div>
  );
}
