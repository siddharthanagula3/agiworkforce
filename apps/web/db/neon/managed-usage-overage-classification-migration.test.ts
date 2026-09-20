import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_DIR = import.meta.dirname;

const MIGRATIONS = fs
  .readdirSync(MIGRATION_DIR)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();

const SOURCES = new Map(
  MIGRATIONS.map((name) => [name, fs.readFileSync(path.join(MIGRATION_DIR, name), 'utf8')]),
);

const ADDING_MIGRATION = '0279_managed_usage_overage_classification.sql';

/**
 * The body of a function as the last migration to define it left it. Reading
 * anything earlier describes a database that no longer exists.
 */
function latestFunctionBody(name: string): { migration: string; body: string } {
  const opening = `create or replace function public.${name}(`;
  for (const migration of [...MIGRATIONS].reverse()) {
    const source = SOURCES.get(migration) ?? '';
    const start = source.lastIndexOf(opening);
    if (start === -1) continue;
    const end = source.indexOf('$;', source.indexOf('language plpgsql', start));
    const body = end === -1 ? source.slice(start) : source.slice(start, end);
    return { migration, body };
  }
  throw new Error(`no migration defines ${name}`);
}

function latestTriggerOn(table: string, timing: string): { migration: string; statement: string } {
  const pattern = new RegExp(
    `create trigger (\\w+)\\s+${timing} on public\\.${table}\\s+for each row execute function public\\.(\\w+)\\(\\)`,
  );
  for (const migration of [...MIGRATIONS].reverse()) {
    const match = pattern.exec(SOURCES.get(migration) ?? '');
    if (match) return { migration, statement: match[0] };
  }
  throw new Error(`no migration creates a ${timing} trigger on ${table}`);
}

/** The settlement kinds the ledger itself recognises, read out of its guard. */
function managedSettlementTypes(): string[] {
  const { body } = latestFunctionBody('settle_managed_usage_credits_microusd');
  const guard = /if v_operation_type not in \(([\s\S]*?)\)/.exec(body);
  expect(guard).not.toBeNull();
  const types = [...(guard?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((match) => match[1] as string);
  expect(types.length).toBeGreaterThan(0);
  return types;
}

/** The statement that enqueues each settlement kind, wherever it now lives. */
function enqueueCallSite(settlementType: string): string {
  for (const migration of [...MIGRATIONS].reverse()) {
    const source = SOURCES.get(migration) ?? '';
    const marker = `'type', '${settlementType}'`;
    const at = source.lastIndexOf(marker);
    if (at === -1) continue;
    const opening = source.lastIndexOf('jsonb_build_object', at);
    const closing = source.indexOf('),', at);
    return source.slice(opening, closing === -1 ? at + marker.length : closing);
  }
  throw new Error(`nothing enqueues a ${settlementType} settlement`);
}

/** The statement that tags ledger rows written before the classification. */
function ledgerBackfill(): string {
  const source = SOURCES.get(ADDING_MIGRATION) ?? '';
  const start = source.indexOf('update public.credit_transactions transaction_row');
  expect(start, 'the migration tags no existing ledger row').toBeGreaterThan(-1);
  return source.slice(start, source.indexOf(';', start));
}

describe('managed usage overage classification', () => {
  it('is a draft until someone approves running it', () => {
    expect(SOURCES.get(ADDING_MIGRATION)).toContain('NOT YET APPLIED');
  });

  it('stores the admission verdict on the request, not on one of its ledger rows', () => {
    expect(SOURCES.get(ADDING_MIGRATION)).toContain(
      'add column if not exists is_overage boolean not null default false',
    );
    expect(SOURCES.get(ADDING_MIGRATION)).toMatch(
      /alter table public\.managed_usage_requests\s+add column if not exists is_overage/,
    );
  });

  it('tags the ledger rows a classified request already wrote', () => {
    const backfill = ledgerBackfill();
    expect(backfill).toContain("jsonb_build_object('is_overage', true)");
    expect(backfill).toContain('from public.managed_usage_requests request_row');
    expect(backfill).toContain('request_row.is_overage');
    expect(backfill).toContain(
      "request_row.id::text = transaction_row.metadata->>'managed_usage_request_id'",
    );
    expect(backfill).toContain("transaction_row.metadata->>'is_overage' is distinct from 'true'");
  });

  it('bounds the backfill to rows a rolling window can still sum', () => {
    const backfill = ledgerBackfill();
    const bound = /created_at >= now\(\) - interval '(\d+) days'/.exec(backfill);
    expect(bound, 'the backfill must not rewrite the whole ledger').not.toBeNull();
    const longestWindowDays = Number(
      /created_at >= now\(\) - interval '(\d+) days'/.exec(
        latestFunctionBody('reserve_managed_usage_request_with_limits_microusd').body,
      )?.[1],
    );
    expect(longestWindowDays).toBeGreaterThan(0);
    expect(Number(bound?.[1])).toBeGreaterThan(longestWindowDays);
  });

  it('restricts the backfill to rows the unit trigger cannot move', () => {
    const backfill = ledgerBackfill();
    expect(backfill).toContain(
      'transaction_row.amount_cents\n      = public.microusd_to_cents_mirror(transaction_row.amount_microusd)',
    );
    // Only metadata is assigned, so amount_microusd cannot change and the
    // before-update trigger recomputes the cents mirror the predicate pins.
    const assigned = backfill.slice(backfill.indexOf('\nset '), backfill.indexOf('\nfrom '));
    expect(assigned).toContain('metadata =');
    expect(assigned).not.toMatch(/amount_(cents|microusd)\s*=/);
    expect(assigned).not.toMatch(/\b(user_id|credit_account_id)\s*=/);
  });

  it('records the verdict on the same statement that admits the request', () => {
    const { body } = latestFunctionBody('reserve_managed_usage_request_with_limits_microusd');
    expect(body).toMatch(
      /update public\.managed_usage_requests[\s\S]*?set is_flagship = p_is_flagship,\s*\n\s*is_overage = v_is_overage,/,
    );
  });

  it('inherits both classifications onto every ledger row of a request', () => {
    const { statement } = latestTriggerOn('credit_transactions', 'before insert');
    const labeller = /execute function public\.(\w+)\(\)/.exec(statement)?.[1];
    expect(labeller).toBeDefined();

    const { body } = latestFunctionBody(labeller as string);
    expect(body).toContain("new.metadata ? 'managed_usage_request_id'");
    expect(body).toContain("'is_flagship', v_request.is_flagship");
    expect(body).toContain("'is_overage', v_request.is_overage");
  });

  it('keeps the labeller sorting before the unit trigger that must write last', () => {
    const labeller = /create trigger (\w+)/.exec(
      latestTriggerOn('credit_transactions', 'before insert').statement,
    )?.[1];
    expect(labeller).toBeDefined();
    expect((labeller as string) < 'sync_credit_transactions_units').toBe(true);
  });

  it('gives every settlement kind the request id the labeller classifies by', () => {
    const types = managedSettlementTypes();
    expect(types).toContain('managed_usage_finalization');
    expect(types).toContain('managed_usage_outcome_unknown');

    for (const settlementType of types) {
      expect(enqueueCallSite(settlementType)).toContain("'managed_usage_request_id'");
    }
  });

  it('never lets a settlement metadata builder name its own classification', () => {
    for (const settlementType of managedSettlementTypes()) {
      expect(enqueueCallSite(settlementType)).not.toContain("'is_overage'");
    }
  });

  it('excludes a classified row from every rolling window that bounds a plan', () => {
    for (const name of [
      'reserve_managed_usage_request_with_limits_microusd',
      'extend_managed_usage_request_provider_step_microusd',
    ]) {
      const { body } = latestFunctionBody(name);
      const windows = [...body.matchAll(/coalesce\(sum\(transaction_row\.amount_microusd\)/g)];
      expect(windows.length).toBeGreaterThan(0);
      const filters = [...body.matchAll(/metadata->>'is_overage' is distinct from 'true'/g)];
      expect(filters.length).toBe(windows.length);
    }
  });

  it('reverses to the flagship-only labelling it replaced', () => {
    const down = fs.readFileSync(
      path.join(MIGRATION_DIR, 'down', ADDING_MIGRATION.replace(/\.sql$/, '.down.sql')),
      'utf8',
    );
    expect(down).toContain('create trigger label_managed_usage_transaction_flagship');
    expect(down).toContain("'is_flagship', v_is_flagship");
    expect(down).not.toContain('v_request.is_overage');
    expect(down).toContain('drop column if exists is_overage');
  });
});
