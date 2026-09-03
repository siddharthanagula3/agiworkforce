import 'server-only';

import { logger } from '@/lib/logger';

const RLS_POOL_SIZE = 20;
const SERVICE_POOL_SIZE = 10;

/**
 * Small on purpose. The Stripe webhook is low-QPS and its only job is to be
 * unable to starve anything else; a wide pool here would defeat the isolation
 * it exists to provide.
 */
const WEBHOOK_POOL_SIZE = 4;

/**
 * Server-side ceiling on one statement. Postgres cancels the query itself, so
 * the client is released back to the pool rather than held until the function
 * is killed. Deliberately below the 30s floor of the shortest route budget.
 */
const STATEMENT_TIMEOUT_MS = 15_000;

const QUERY_TIMEOUT_MS = 20_000;

const CONNECTION_TIMEOUT_MS = 10_000;

export interface DatabasePoolTuning {
  poolSize: number;
  connectionTimeoutMs: number;
  statementTimeoutMs: number;
  queryTimeoutMs: number;
}

const SHARED_TUNING = {
  connectionTimeoutMs: CONNECTION_TIMEOUT_MS,
  statementTimeoutMs: STATEMENT_TIMEOUT_MS,
  queryTimeoutMs: QUERY_TIMEOUT_MS,
} as const;

export const RLS_POOL_TUNING: DatabasePoolTuning = {
  poolSize: RLS_POOL_SIZE,
  ...SHARED_TUNING,
};

export const SERVICE_POOL_TUNING: DatabasePoolTuning = {
  poolSize: SERVICE_POOL_SIZE,
  ...SHARED_TUNING,
};

export const WEBHOOK_POOL_TUNING: DatabasePoolTuning = {
  poolSize: WEBHOOK_POOL_SIZE,
  ...SHARED_TUNING,
};

const POOLED_ENDPOINT_MARKER = '-pooler.';

/**
 * Warns once per instance when production is pointed at Neon's direct endpoint.
 *
 * The pool sizes above assume the pooled endpoint, whose client-connection
 * ceiling is far above anything this app opens. The direct endpoint's ceiling
 * is the compute size's `max_connections`, shared by every warm instance at
 * once, and nothing else in the deployment states which one is configured.
 */
export function assertPooledDatabaseEndpoint(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const connectionString = process.env['AGI_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!connectionString || connectionString.includes(POOLED_ENDPOINT_MARKER)) return;
  logger.warn(
    { poolSize: RLS_POOL_SIZE + SERVICE_POOL_SIZE + WEBHOOK_POOL_SIZE },
    'Database connection string is not Neon’s pooled (-pooler) endpoint; per-instance pool sizes are sized against the pooled ceiling and may exhaust the compute’s max_connections',
  );
}
