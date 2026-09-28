import 'server-only';

import type {
  FinanceCategoryTotal,
  FinanceMonthTotal,
  FinanceOverviewPeriod,
  FinanceOverviewResponse,
} from '@agiworkforce/cloud-contracts';
import {
  readBankAccountOverview,
  type BankTransactionSummary,
} from '@/lib/connectors/bank-accounts';

const RECENT_TRANSACTIONS = 25;
const UNCATEGORIZED = 'OTHER';
const INCOME_CATEGORY = 'INCOME';
const NOT_SPENDING: ReadonlySet<string> = new Set([
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'LOAN_PAYMENTS',
  INCOME_CATEGORY,
]);

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function financePeriodRange(
  period: FinanceOverviewPeriod,
  now: Date = new Date(),
): { start: string; end: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  if (period === '12m') {
    start.setUTCFullYear(start.getUTCFullYear() - 1);
    start.setUTCDate(start.getUTCDate() + 1);
  } else {
    start.setUTCDate(start.getUTCDate() - (period === '90d' ? 89 : 29));
  }
  return { start: isoDate(start), end: isoDate(end) };
}

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

function dominantCurrency(transactions: readonly BankTransactionSummary[]): string | null {
  const counts = new Map<string, number>();
  for (const transaction of transactions) {
    if (!transaction.currency) continue;
    counts.set(transaction.currency, (counts.get(transaction.currency) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [currency, count] of counts) {
    if (count > bestCount) {
      best = currency;
      bestCount = count;
    }
  }
  return best;
}

export function summarizeFinanceTransactions(
  transactions: readonly BankTransactionSummary[],
  fallbackCurrency: string | null,
): {
  currency: string | null;
  total: number;
  income: number;
  byCategory: FinanceCategoryTotal[];
  byMonth: FinanceMonthTotal[];
} {
  const posted = transactions.filter((transaction) => !transaction.pending);
  const currency = dominantCurrency(posted) ?? fallbackCurrency;
  const categories = new Map<string, { amount: number; transactions: number }>();
  const months = new Map<string, { spending: number; income: number }>();
  let total = 0;
  let income = 0;
  for (const transaction of posted) {
    if (transaction.currency !== currency) continue;
    const month = transaction.date.slice(0, 7);
    const bucket = months.get(month) ?? { spending: 0, income: 0 };
    const category = transaction.category ?? UNCATEGORIZED;
    if (transaction.amount > 0 && !NOT_SPENDING.has(category)) {
      total += transaction.amount;
      bucket.spending += transaction.amount;
      const entry = categories.get(category) ?? { amount: 0, transactions: 0 };
      entry.amount += transaction.amount;
      entry.transactions += 1;
      categories.set(category, entry);
    } else if (transaction.amount < 0 && category === INCOME_CATEGORY) {
      income -= transaction.amount;
      bucket.income -= transaction.amount;
    }
    months.set(month, bucket);
  }
  return {
    currency,
    total: cents(total),
    income: cents(income),
    byCategory: [...categories.entries()]
      .map(([category, entry]) => ({
        category,
        amount: cents(entry.amount),
        transactions: entry.transactions,
      }))
      .sort((left, right) => right.amount - left.amount),
    byMonth: [...months.entries()]
      .map(([month, entry]) => ({
        month,
        spending: cents(entry.spending),
        income: cents(entry.income),
      }))
      .sort((left, right) => left.month.localeCompare(right.month)),
  };
}

export async function readFinanceOverview(
  userId: string,
  period: FinanceOverviewPeriod,
): Promise<FinanceOverviewResponse> {
  const range = financePeriodRange(period);
  const overview = await readBankAccountOverview(userId, {
    startDate: range.start,
    endDate: range.end,
  });
  if (overview.status !== 'ready') return { status: overview.status };
  const summary = summarizeFinanceTransactions(
    overview.transactions,
    overview.accounts.find((account) => account.currency)?.currency ?? null,
  );
  return {
    status: 'ready',
    period: { key: period, start: range.start, end: range.end },
    currency: summary.currency,
    accounts: overview.accounts,
    spending: { total: summary.total, byCategory: summary.byCategory, byMonth: summary.byMonth },
    income: summary.income,
    recent: [...overview.transactions]
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, RECENT_TRANSACTIONS),
    truncated: overview.transactions.length < overview.totalTransactions,
  };
}
