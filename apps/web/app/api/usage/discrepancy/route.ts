import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  formatCredits,
  getBillingPlanPricing,
  isBillingPlanTier,
  type ManagedUsageCreditWindow,
} from '@agiworkforce/types';

import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/read-json-body';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { MAX_TICKET_MESSAGE_CHARS, openTicket } from '@/lib/support/tickets/service';
import {
  readAccountUsageHistory,
  readAccountUsageRecords,
  type AccountUsageBreakdownRow,
  type AccountUsageHistory,
  type AccountUsageRecord,
} from '@/lib/services/account-usage-history-service';
import {
  getManagedUsageSummary,
  type AccountUsageSummary,
} from '@/lib/services/managed-usage-summary-service';
import { resolveUsageWindow } from '@/lib/services/usage-aggregation';

export const runtime = 'nodejs';

const NOTE_MAX_CHARS = MAX_TICKET_MESSAGE_CHARS / 2;
const RECORD_ROW_LIMIT = 12;
const EARLIEST_REQUEST_LOOKUP = new Date(0).toISOString();

const ReportSchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  requestId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(NOTE_MAX_CHARS),
});

function credits(value: number): string {
  return formatCredits(value, { maximumFractionDigits: 2 });
}

function day(iso: string): string {
  return iso.slice(0, 10);
}

function planLabel(tier: string): string {
  const normalized = tier.trim().toLowerCase();
  return isBillingPlanTier(normalized) ? getBillingPlanPricing(normalized).label : tier;
}

function windowLine(label: string, window: ManagedUsageCreditWindow | null | undefined) {
  if (!window) return [];
  const resets = window.reset_at ? `, resets ${window.reset_at}` : '';
  return [`${label}: used ${credits(window.used)} of ${credits(window.allowance)}${resets}`];
}

interface RecordLine {
  name: string;
  requests: number;
  credits: number;
}

function breakdownLines(caption: string, rows: readonly RecordLine[]): string[] {
  if (rows.length === 0) return [];
  return [
    caption,
    ...rows
      .slice(0, RECORD_ROW_LIMIT)
      .map((row) => `  ${row.name}: ${row.requests} requests, ${credits(row.credits)}`),
  ];
}

function named(rows: readonly AccountUsageBreakdownRow[]): RecordLine[] {
  return rows.map((row) => ({ name: row.label ?? row.key, ...row }));
}

function requestLines(record: AccountUsageRecord | null): string[] {
  if (!record) return [];
  return [
    `Disputed request ${record.requestId}`,
    `  created ${record.createdAt}, settled ${record.finalizedAt ?? 'unknown'}`,
    `  model ${record.model}, product area ${record.workload ?? record.operation ?? 'unattributed'}`,
    `  ${record.inputTokens} input tokens, ${record.outputTokens} output tokens, ${credits(record.credits)}`,
  ];
}

function balanceLines(summary: AccountUsageSummary): string[] {
  const balances = summary.credits;
  if (!balances) return [`Plan: ${planLabel(summary.plan_tier)}`];
  const bonus = balances.bonus;
  return [
    `Plan: ${planLabel(summary.plan_tier)}`,
    ...windowLine('5-hour window', balances.five_hour),
    ...windowLine('Week', balances.weekly),
    ...windowLine('Month', balances.monthly),
    bonus === null
      ? 'Bonus credits: could not be read'
      : `Bonus credits: ${credits(bonus.remaining)}${
          bonus.next_expiry_at
            ? `, ${credits(bonus.next_expiry_credits)} expire ${bonus.next_expiry_at}`
            : ''
        }`,
    balances.purchased.remaining === null
      ? 'Purchased credits: could not be read'
      : `Purchased credits: ${credits(balances.purchased.remaining)}`,
  ];
}

function usageRecord(input: {
  history: AccountUsageHistory;
  summary: AccountUsageSummary;
  request: AccountUsageRecord | null;
}): string {
  const { history, summary, request } = input;
  return [
    'Usage record attached by the server when this report was filed.',
    `Window: ${day(history.from)} to ${day(history.to)} (UTC)`,
    `Settled: ${history.totals.requests} requests, ${credits(history.totals.credits)}`,
    `Still settling: ${history.freshness.unsettledRequests} requests`,
    ...requestLines(request),
    ...breakdownLines(
      'By day',
      history.periods
        .slice(-RECORD_ROW_LIMIT)
        .reverse()
        .map((period) => ({ name: day(period.start), ...period })),
    ),
    ...breakdownLines('By model', named(history.byModel)),
    ...breakdownLines('By product area', named(history.byWorkload)),
    'Balances at filing',
    ...balanceLines(summary).map((line) => `  ${line}`),
  ].join('\n');
}

async function handleCreate(request: NextRequest) {
  const { userId, email } = await getClerkAuthUser(request);

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const limited = await withRateLimit(request, 'support-tickets-write', `user:${userId}`);
  if (limited) return limited;

  const parsed = ReportSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid discrepancy report', parsed.error);
  }
  if (!email) {
    throw createError.validation('Add an email address to your account so support can reply.');
  }

  const { db } = await getUserScopedDb(request);
  const window = resolveUsageWindow(parsed.data.from, parsed.data.to);

  const [history, summary, disputed] = await Promise.all([
    readAccountUsageHistory(db, userId, window, 'day'),
    getManagedUsageSummary(db, userId),
    parsed.data.requestId
      ? readAccountUsageRecords(db, userId, resolveUsageWindow(EARLIEST_REQUEST_LOOKUP, null), {
          requestId: parsed.data.requestId,
          limit: 1,
        })
      : Promise.resolve([]),
  ]);

  if (parsed.data.requestId && disputed.length === 0) {
    throw createError.validation('That request ID is not a settled request on this account.');
  }

  const { ticket, staffNotified } = await openTicket({
    userId,
    name: email,
    email,
    subject: `Billing discrepancy: usage from ${day(window.from)} to ${day(window.to)}`,
    message: [
      parsed.data.message,
      usageRecord({ history, summary, request: disputed[0] ?? null }),
    ].join('\n\n'),
  });

  logger.info({ userId, ticketId: ticket.id }, '[usage-discrepancy] reported');

  return NextResponse.json(
    { ticket, staffNotified },
    { status: 201, headers: { 'cache-control': 'no-store' } },
  );
}

export const POST = withErrorHandler(handleCreate);
