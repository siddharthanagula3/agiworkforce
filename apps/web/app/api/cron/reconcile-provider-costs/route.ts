import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';

import {
  PROVIDER_COST_REPORT_CLIENTS,
  yesterdayWindow,
  type DayWindow,
  type ProviderCostReport,
  type ProviderCostReportClient,
} from './lib/provider-cost-reports';

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

  return NextResponse.json(
    {
      day: window.day,
      reported: outcomes.filter((outcome) => outcome.status === 'reported').length,
      providers: outcomes,
    },
    { status: failed.length > 0 ? 500 : 200 },
  );
}
