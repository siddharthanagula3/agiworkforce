import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { USAGE_WORKLOADS } from './usage-attribution';

const MIGRATIONS_DIR = path.join(process.cwd(), 'db/neon');

const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();

function executableSql(filename: string): string {
  return readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8')
    .split('\n')
    .map((line) => line.replace(/--.*$/u, ''))
    .join('\n');
}

/**
 * Every column the cost ledger will have once the migrations have run: the
 * table as it was created, plus each column any later migration adds. Reading
 * one file would describe a schema that only existed for one release.
 */
function ledgerColumns(): Set<string> {
  const columns = new Set<string>();
  for (const filename of MIGRATIONS) {
    const sql = executableSql(filename);
    const created =
      /create table if not exists public\.provider_cost_events \(([\s\S]*?)\n\);/.exec(sql);
    if (created?.[1]) {
      for (const match of created[1].matchAll(/^ {2}([a-z_]+) /gm)) columns.add(match[1] as string);
    }
    for (const altered of sql.matchAll(
      /alter table (?:if exists )?public\.provider_cost_events([\s\S]*?);/g,
    )) {
      for (const match of (altered[1] as string).matchAll(/add column if not exists ([a-z_]+)/g)) {
        columns.add(match[1] as string);
      }
    }
  }
  if (columns.size === 0) throw new Error('No migration creates public.provider_cost_events');
  return columns;
}

/**
 * The dimensions a settled unit of usage must be attributable by. Each names
 * the columns that carry it, so a dimension cannot be satisfied by a comment
 * or by something a query would have to dig out of `metadata`.
 */
const ATTRIBUTION_DIMENSIONS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['workspace', ['workspace_id', 'organization_id']],
  ['conversation', ['session_id', 'project_id']],
  ['turn or task', ['task_ref', 'task_outcome']],
  ['model', ['model']],
  ['provider route', ['provider', 'route_id']],
  ['input tokens', ['input_tokens']],
  ['output tokens', ['output_tokens', 'reasoning_tokens']],
  ['cache', ['cached_tokens', 'cache_hit', 'cache_read_units', 'cache_write_units']],
  ['tool calls', ['capability', 'feature']],
  ['compute', ['unit_basis', 'units']],
  ['browser time', ['capability', 'unit_basis']],
  ['sandbox time', ['capability', 'unit_basis']],
  ['storage', ['capability', 'unit_basis']],
  ['media generation', ['capability', 'units']],
  ['estimated provider cost', ['provider_estimated_cost_microusd', 'reconciliation_status']],
  ['internal credits', ['customer_credits', 'customer_canonical_microusd']],
  ['product area', ['workload', 'surface']],
];

/** Columns that identify or bookkeep a row rather than attribute its usage. */
const NON_ATTRIBUTION_COLUMNS = new Set([
  'id',
  'occurred_at',
  'created_at',
  'user_id',
  'source_ref',
  'metadata',
  'prompt_ids',
  'provider_cost_cents',
  'billed_cents',
  'provider_reported_cost_microusd',
  'avoided_cost_microusd',
  'cache_savings_cents',
  'cache_write_premium_cents',
  'compaction_saved_units',
]);

describe('what a settled unit of usage can be attributed to', () => {
  const columns = ledgerColumns();

  it.each(ATTRIBUTION_DIMENSIONS)('records %s', (_dimension, carriers) => {
    for (const column of carriers) {
      expect(columns.has(column), `provider_cost_events has no ${column}`).toBe(true);
    }
  });

  it('leaves no column of the ledger unaccounted for', () => {
    const claimed = new Set(ATTRIBUTION_DIMENSIONS.flatMap(([, carriers]) => carriers));
    const unaccounted = [...columns].filter(
      (column) => !claimed.has(column) && !NON_ATTRIBUTION_COLUMNS.has(column),
    );
    expect(
      unaccounted,
      'a new cost-ledger column must be named as a dimension it attributes, or as bookkeeping',
    ).toEqual([]);
  });

  it('spells the product areas the same way the attribution contract does', () => {
    let enforced: string[] | null = null;
    for (const filename of [...MIGRATIONS].reverse()) {
      const match = /workload is null or workload = any \(array\[([^\]]+)\]\)/.exec(
        executableSql(filename),
      );
      if (match?.[1]) {
        enforced = match[1]
          .split(',')
          .map((value) => value.trim().replace(/^'|'$/gu, ''))
          .filter((value) => value.length > 0);
        break;
      }
    }
    expect(enforced).not.toBeNull();
    expect([...(enforced ?? [])].sort()).toEqual([...USAGE_WORKLOADS].sort());
  });
});
