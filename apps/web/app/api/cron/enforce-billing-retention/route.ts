import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import {
  FINANCIAL_RETENTION_RULES,
  financialRetentionStatement,
  type FinancialRetentionRule,
} from '@/lib/billing/financial-record-retention';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';

export const runtime = 'nodejs';

interface RuleOutcome {
  table: string;
  action: FinancialRetentionRule['action'];
  afterDays: number;
  rows: number;
  error?: string;
}

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getNeonDb();
  const applied: RuleOutcome[] = [];
  let purged = 0;
  let minimised = 0;
  let failed = 0;

  for (const rule of FINANCIAL_RETENTION_RULES) {
    const statement = financialRetentionStatement(rule);
    try {
      const rows = await db.query<{ retention_key: string }>(statement.sql, [...statement.params]);
      if (rule.action === 'purge') {
        purged += rows.length;
      } else {
        minimised += rows.length;
      }
      applied.push({
        table: rule.table,
        action: rule.action,
        afterDays: rule.afterDays,
        rows: rows.length,
      });
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { table: rule.table, action: rule.action, error: message },
        'Financial retention rule failed',
      );
      applied.push({
        table: rule.table,
        action: rule.action,
        afterDays: rule.afterDays,
        rows: 0,
        error: message,
      });
    }
  }

  logger.info({ purged, minimised, failed }, 'Financial record retention sweep completed');

  return NextResponse.json(
    {
      message: 'Financial record retention sweep completed',
      purged,
      minimised,
      failed,
      applied,
    },
    { status: failed === FINANCIAL_RETENTION_RULES.length ? 500 : 200 },
  );
}
