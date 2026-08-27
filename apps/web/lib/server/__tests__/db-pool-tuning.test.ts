import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RLS_POOL_TUNING, SERVICE_POOL_TUNING, WEBHOOK_POOL_TUNING } from '../db-pool-tuning';

/**
 * `pg-pool` applies `max: 10` and NO statement or query timeout when the
 * adapter is handed none, and the adapter only forwards each option when it is
 * defined. Both production pools were constructed with neither, so the whole
 * per-instance budget was ten clients with nothing but a 10s connect timeout
 * bounding a query that hangs. These assertions exist because the failure mode
 * of losing them again is invisible: nothing errors, requests simply start
 * queueing inside the function while the database dashboard shows idle.
 */
const POOLS = [
  ['rls', RLS_POOL_TUNING],
  ['service', SERVICE_POOL_TUNING],
  ['webhook', WEBHOOK_POOL_TUNING],
] as const;

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('database pool tuning', () => {
  it.each(POOLS)('%s pool bounds its size and both timeouts', (_name, tuning) => {
    expect(tuning.poolSize).toBeGreaterThan(0);
    expect(tuning.statementTimeoutMs).toBeGreaterThan(0);
    expect(tuning.queryTimeoutMs).toBeGreaterThan(0);
    expect(tuning.connectionTimeoutMs).toBeGreaterThan(0);
  });

  it('lets the server-side cancel win over the client-side backstop', () => {
    // A client-side `query_timeout` shorter than `statement_timeout` reports a
    // generic client abort and leaves Postgres still running the statement.
    for (const [, tuning] of POOLS) {
      expect(tuning.queryTimeoutMs).toBeGreaterThan(tuning.statementTimeoutMs);
    }
  });

  it('gives the RLS pool the largest budget, since it carries every streamed turn', () => {
    expect(RLS_POOL_TUNING.poolSize).toBeGreaterThan(SERVICE_POOL_TUNING.poolSize);
    expect(SERVICE_POOL_TUNING.poolSize).toBeGreaterThan(WEBHOOK_POOL_TUNING.poolSize);
  });

  it('applies the tuning at every production pool construction site', () => {
    expect(source('lib/server/rls-db.ts')).toContain('...RLS_POOL_TUNING');
    expect(source('lib/server/neon-db.ts')).toContain('...SERVICE_POOL_TUNING');
    expect(source('lib/server/neon-db.ts')).toContain('...WEBHOOK_POOL_TUNING');
  });
});
