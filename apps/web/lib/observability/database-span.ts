import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { recordDatabaseOperation } from './metrics';
import { withSpan } from './span';

const DATABASE_SYSTEM = 'postgresql';

export interface DatabaseSpanOptions {
  readonly operation: string;
  readonly table?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export async function withDatabaseSpan<R>(
  options: DatabaseSpanOptions,
  fn: () => Promise<R> | R,
): Promise<R> {
  const startedAt = Date.now();
  try {
    const result = await withSpan(
      `db.${options.operation}`,
      {
        domain: 'database',
        kind: 'client',
        attributes: {
          'db.system.name': DATABASE_SYSTEM,
          'db.operation.name': options.operation,
          ...(options.table ? { 'db.collection.name': options.table } : {}),
          ...options.attributes,
        },
      },
      fn,
    );
    recordDatabaseOperation({
      operation: options.operation,
      outcome: 'ok',
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    recordDatabaseOperation({
      operation: options.operation,
      outcome: 'error',
      durationMs: Date.now() - startedAt,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    throw error;
  }
}

const STATEMENT_VERB = /^[\s(]*([a-z]+)/iu;
const STATEMENT_TABLE =
  /\b(?:from|into|update|join)\s+(?:only\s+)?([a-z_][\w$]*(?:\.[a-z_][\w$]*)?)/iu;
const UNKNOWN_OPERATION = 'other';
const KNOWN_OPERATIONS: ReadonlySet<string> = new Set([
  'select',
  'insert',
  'update',
  'delete',
  'with',
  'create',
  'alter',
  'drop',
  'truncate',
  'set',
  'begin',
  'commit',
  'rollback',
  'refresh',
  'analyze',
  'vacuum',
  'call',
  'listen',
  'notify',
]);

// The metric is keyed on the operation name, so an unrecognised verb collapses to
// one bucket rather than giving every statement shape its own time series.
function describeStatement(sql: string): DatabaseSpanOptions {
  const verb = STATEMENT_VERB.exec(sql)?.[1]?.toLowerCase();
  const operation = verb && KNOWN_OPERATIONS.has(verb) ? verb : UNKNOWN_OPERATION;
  const table = STATEMENT_TABLE.exec(sql)?.[1]?.toLowerCase();
  return table ? { operation, table } : { operation };
}

export function traceDatabaseAdapter(adapter: DatabaseAdapter): DatabaseAdapter {
  return {
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
      return withDatabaseSpan(describeStatement(sql), () => adapter.query<T>(sql, params));
    },
    execute(sql: string, params?: unknown[]): Promise<number> {
      return withDatabaseSpan(describeStatement(sql), () => adapter.execute(sql, params));
    },
    transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
      return withDatabaseSpan({ operation: 'transaction' }, () =>
        adapter.transaction((tx) => fn(traceDatabaseAdapter(tx))),
      );
    },
    withUser(jwt: string): DatabaseAdapter {
      return traceDatabaseAdapter(adapter.withUser(jwt));
    },
    withOrg(organizationId: string | null): DatabaseAdapter {
      return traceDatabaseAdapter(adapter.withOrg(organizationId));
    },
    dispose(): Promise<void> {
      return adapter.dispose();
    },
  };
}
