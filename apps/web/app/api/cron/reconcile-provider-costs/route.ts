import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  MANAGED_USAGE_RECONCILIATION_FINDINGS,
  reconcileManagedUsageCosts,
  type ManagedUsageReconciliationFinding,
  type ManagedUsageReconciliationRow,
} from '@/lib/services/cogs-ledger-service';

import {
  PROVIDER_COST_REPORT_CLIENTS,
  yesterdayWindow,
  type DayWindow,
  type ProviderCostReport,
  type ProviderCostReportClient,
} from './lib/provider-cost-reports';

export const runtime = 'nodejs';
export const maxDuration = 300;

const UPSERT_REPORTED_DAY = `insert into public.provider_cost_reconciliation_days
    (provider, day, reported_cost_microusd, source, fetched_at)
  values ($1, $2::date, $3, $4, now())
  on conflict (provider, day, source)
  do update set
    reported_cost_microusd = excluded.reported_cost_microusd,
    fetched_at = excluded.fetched_at`;

interface ProviderOutcome {
  provider: string;
  source: string;
  status: ProviderCostReport['status'];
  reportedMicrousd?: number;
  detail?: string;
}

function outcomeOf(report: ProviderCostReport): ProviderOutcome {
  if (report.status === 'reported') {
    return {
      provider: report.provider,
      source: report.source,
      status: report.status,
      reportedMicrousd: report.reportedMicrousd,
    };
  }
  if (report.status === 'not_configured') {
    return {
      provider: report.provider,
      source: report.source,
      status: report.status,
      detail: report.envKey,
    };
  }
  return {
    provider: report.provider,
    source: report.source,
    status: report.status,
    detail: report.reason,
  };
}

async function runClient(
  client: ProviderCostReportClient,
  window: DayWindow,
): Promise<ProviderOutcome> {
  let report: ProviderCostReport;
  try {
    report = await client.fetchDay(window);
  } catch (error) {
    report = {
      status: 'failed',
      provider: client.provider,
      source: client.source,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  if (report.status !== 'reported') return outcomeOf(report);

  try {
    await getNeonDb().execute(UPSERT_REPORTED_DAY, [
      report.provider,
      window.day,
      Math.max(0, Math.round(report.reportedMicrousd)),
      report.source,
    ]);
  } catch (error) {
    return {
      provider: report.provider,
      source: report.source,
      status: 'failed',
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  return outcomeOf(report);
}

type LedgerFindingCounts = Record<ManagedUsageReconciliationFinding, number>;

interface LedgerReconciliation {
  status: 'reconciled' | 'failed';
  findings: number;
  byFinding: LedgerFindingCounts;
  detail?: string;
}

function countFindings(rows: readonly ManagedUsageReconciliationRow[]): LedgerFindingCounts {
  const counts = Object.fromEntries(
    MANAGED_USAGE_RECONCILIATION_FINDINGS.map((finding) => [finding, 0]),
  ) as LedgerFindingCounts;
  for (const row of rows) counts[row.finding] += 1;
  return counts;
}

async function reconcileLedger(window: DayWindow): Promise<LedgerReconciliation> {
  let rows: ManagedUsageReconciliationRow[];
  try {
    rows = await reconcileManagedUsageCosts(window.start, window.end);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logger.error(
      { event: 'managed_usage_reconciliation_failed', day: window.day, detail },
      'The settled managed usage ledger could not be reconciled against the cost events',
    );
    return {
      status: 'failed',
      findings: 0,
      byFinding: countFindings([]),
      detail,
    };
  }

  const byFinding = countFindings(rows);
  if (rows.length > 0) {
    logger.error(
      {
        event: 'managed_usage_reconciliation_findings',
        day: window.day,
        findings: rows.length,
        byFinding,
        sourceRefs: rows.slice(0, 20).map((row) => row.sourceRef),
      },
      'Settled managed usage turns do not agree with the provider cost events for this day',
    );
  }

  return { status: 'reconciled', findings: rows.length, byFinding };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized provider cost reconciliation cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const window = yesterdayWindow(new Date());
  const outcomes: ProviderOutcome[] = [];
  for (const client of PROVIDER_COST_REPORT_CLIENTS) {
    outcomes.push(await runClient(client, window));
  }

  const unknown = outcomes.filter((outcome) => outcome.status === 'unknown');
  if (unknown.length > 0) {
    logger.info(
      {
        event: 'provider_cost_report_unknown',
        day: window.day,
        providers: unknown.map((outcome) => outcome.provider),
      },
      'These providers have no confirmed read-only cost endpoint; their ledger cost stays unreconciled',
    );
  }

  const notConfigured = outcomes.filter((outcome) => outcome.status === 'not_configured');
  if (notConfigured.length > 0) {
    logger.warn(
      {
        event: 'provider_cost_report_not_configured',
        day: window.day,
        envKeys: notConfigured.map((outcome) => outcome.detail),
      },
      'A provider cost report was skipped because its admin credential is not set',
    );
  }

  const failed = outcomes.filter((outcome) => outcome.status === 'failed');
  if (failed.length > 0) {
    logger.error(
      {
        event: 'provider_cost_report_failed',
        day: window.day,
        providers: failed.map((outcome) => outcome.provider),
      },
      'A provider cost report could not be fetched or stored',
    );
  }

  const ledger = await reconcileLedger(window);

  return NextResponse.json(
    {
      day: window.day,
      reported: outcomes.filter((outcome) => outcome.status === 'reported').length,
      providers: outcomes,
      ledger,
    },
    { status: failed.length > 0 || ledger.status === 'failed' ? 500 : 200 },
  );
}
