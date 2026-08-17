import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

import {
  FINANCIAL_RETENTION_RULES,
  FINANCIAL_TABLES_WITHOUT_MAXIMUM_AGE,
  MAX_ROWS_PER_TABLE_PER_RUN,
  METERING_EVIDENCE_RETENTION_DAYS,
  STATUTORY_RECORD_RETENTION_DAYS,
  financialRetentionStatement,
} from '../lib/billing/financial-record-retention';
import {
  ANONYMIZED_USER_COLUMNS,
  UNDELETED_USER_TABLES,
  USER_SCOPED_TABLES,
} from '../lib/server/account-erasure';

function readNormalized(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), 'utf-8').replace(/\s+/g, ' ');
}

const privacySource = readNormalized('../app/privacy/page.tsx');
const dpaSource = readNormalized('../app/dpa/page.tsx');
const vercelConfig = JSON.parse(
  readFileSync(resolve(__dirname, '../../../vercel.json'), 'utf-8'),
) as { crons?: Array<{ path: string; schedule: string }> };

const RETENTION_CRON_PATH = '/api/cron/enforce-billing-retention';

describe('BIZ-046 billing-record retention disclosure', () => {
  it('gives billing records their own row in the retention schedule', () => {
    expect(privacySource).toContain('Billing records');
  });

  it('discloses that some billing rows outlive the account', () => {
    expect(privacySource).toMatch(/survive on purpose/i);
    expect(privacySource).toMatch(/double-charge protection keys/i);
  });

  it('matches erasure: subscription, credit and usage rows are deleted', () => {
    const deleted = new Set(USER_SCOPED_TABLES.map((entry) => entry.table));
    for (const table of ['subscriptions', 'credit_transactions', 'token_credits', 'usage_events']) {
      expect(deleted.has(table)).toBe(true);
    }
  });

  it('matches erasure: double-charge and in-flight settlement rows are kept', () => {
    expect(Object.keys(UNDELETED_USER_TABLES)).toEqual(
      expect.arrayContaining(['credit_idempotency_keys', 'credit_settlement_jobs']),
    );
  });

  it('matches erasure: organization billing history is kept with the user id removed', () => {
    const anonymized = ANONYMIZED_USER_COLUMNS.find(
      (entry) => entry.table === 'organization_usage_ledger',
    );
    expect(anonymized?.column).toBe('user_id');
  });
});

describe('BILL-35 financial-record retention schedule', () => {
  it('caps every append-only financial table at a maximum age', () => {
    const purged = new Set(
      FINANCIAL_RETENTION_RULES.filter((rule) => rule.action === 'purge').map((rule) => rule.table),
    );

    for (const table of [
      'credit_transactions',
      'organization_usage_ledger',
      'usage_events',
      'credit_idempotency_keys',
      'credit_settlement_jobs',
      'processed_stripe_events',
    ]) {
      expect(purged, `${table} has no maximum age`).toContain(table);
    }
  });

  it('keeps the statutory books longer than the metering evidence beside them', () => {
    expect(STATUTORY_RECORD_RETENTION_DAYS).toBeGreaterThan(METERING_EVIDENCE_RETENTION_DAYS);

    for (const table of ['credit_transactions', 'organization_usage_ledger']) {
      const purge = FINANCIAL_RETENTION_RULES.find(
        (rule) => rule.table === table && rule.action === 'purge',
      );
      expect(purge?.afterDays).toBe(STATUTORY_RECORD_RETENTION_DAYS);
    }
  });

  it('minimises a sensitive column strictly before it deletes the row', () => {
    for (const rule of FINANCIAL_RETENTION_RULES) {
      if (rule.action !== 'minimise') continue;
      const purge = FINANCIAL_RETENTION_RULES.find(
        (other) => other.action === 'purge' && other.table === rule.table,
      );
      expect(purge, `${rule.table} is minimised but never purged`).toBeDefined();
      expect(rule.afterDays).toBeLessThan(purge?.afterDays ?? 0);
      expect(rule.minimise.length).toBeGreaterThan(0);
    }
  });

  it('never ages out live plan or balance state', () => {
    const ageless = new Set(FINANCIAL_TABLES_WITHOUT_MAXIMUM_AGE.map((entry) => entry.table));
    expect(ageless).toEqual(new Set(['subscriptions', 'token_credits']));

    for (const rule of FINANCIAL_RETENTION_RULES) {
      expect(ageless.has(rule.table)).toBe(false);
    }
  });

  it('builds bounded, parameterised statements for every rule', () => {
    for (const rule of FINANCIAL_RETENTION_RULES) {
      const statement = financialRetentionStatement(rule);

      expect(statement.params).toEqual([`${rule.afterDays} days`, MAX_ROWS_PER_TABLE_PER_RUN]);
      expect(statement.sql).toContain('$1::interval');
      expect(statement.sql).toContain('limit $2');
      expect(statement.sql).toContain(`public.${rule.table}`);
      expect(statement.sql).toMatch(rule.action === 'purge' ? /^with due as/ : /update public\./);
      expect(statement.sql).not.toMatch(/\d+ days/);
    }
  });

  it('refuses an identifier that is not a bare column name', () => {
    expect(() =>
      financialRetentionStatement({
        action: 'purge',
        table: 'credit_transactions; drop table profiles',
        keyColumn: 'id',
        ageColumn: 'created_at',
        afterDays: 1,
        basis: 'fixture',
      }),
    ).toThrow(/Unsafe table/);
  });
});

describe('BILL-35 the schedule is actually run and actually published', () => {
  it('schedules the retention sweep in vercel.json', () => {
    const cron = vercelConfig.crons?.find((entry) => entry.path === RETENTION_CRON_PATH);
    expect(cron, `${RETENTION_CRON_PATH} exists but nothing runs it`).toBeDefined();
    expect(cron?.schedule).toMatch(/^\d+ \d+ \* \* \*$/);
  });

  it('no longer claims billing rows have no maximum age', () => {
    expect(privacySource).not.toMatch(/No maximum age is enforced on billing rows/i);
    expect(privacySource).toMatch(/daily scheduled job now enforces a maximum age/i);
  });

  it('publishes the same windows the schedule enforces', () => {
    const years = (days: number) => String(Math.round(days / 365.25));
    expect(privacySource).toContain('STATUTORY_RECORD_RETENTION_YEARS');
    expect(privacySource).toContain('METERING_EVIDENCE_RETENTION_YEARS');
    expect(years(STATUTORY_RECORD_RETENTION_DAYS)).toBe('8');
    expect(years(METERING_EVIDENCE_RETENTION_DAYS)).toBe('2');

    const idempotency = FINANCIAL_RETENTION_RULES.find(
      (rule) => rule.table === 'credit_idempotency_keys',
    );
    expect(idempotency?.afterDays).toBe(0);

    const settlement = FINANCIAL_RETENTION_RULES.find(
      (rule) => rule.table === 'credit_settlement_jobs',
    );
    expect(privacySource).toContain(`${settlement?.afterDays} days after they finish`);

    const webhookPurge = FINANCIAL_RETENTION_RULES.find(
      (rule) => rule.table === 'processed_stripe_events' && rule.action === 'purge',
    );
    expect(privacySource).toContain(`${webhookPurge?.afterDays} days after processing`);
  });

  it('records the policy in the DPA', () => {
    expect(dpaSource).toContain('Financial-record retention');
    expect(dpaSource).toMatch(/statutory record-keeping period/i);
    expect(dpaSource).toMatch(/no maximum age by design/i);
  });
});
