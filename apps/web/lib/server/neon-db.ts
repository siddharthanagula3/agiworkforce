/**
 * Neither handle names a provider. `createDatabaseClient` resolves it from
 * AGI_DATABASE_PROVIDER, so pointing the app at a different Postgres host is
 * provider selection plus credentials rather than a code change. Pinning the
 * provider here would silently defeat that env var.
 */
import 'server-only';

import { createDatabaseClient } from '@agiworkforce/data-layer';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { SERVICE_POOL_TUNING, WEBHOOK_POOL_TUNING } from '@/lib/server/db-pool-tuning';
import { reportDatabaseConnectionError } from '@/lib/server/db-connection-error';

let db: DatabaseAdapter | null = null;
let webhookDb: DatabaseAdapter | null = null;

export function getNeonDb(): DatabaseAdapter {
  if (!db) {
    db = createDatabaseClient({
      applicationName: 'agi-web',
      onConnectionError: reportDatabaseConnectionError,
      ...SERVICE_POOL_TUNING,
    });
  }
  return db;
}

/**
 * A pool of its own for the Stripe webhook.
 *
 * The webhook opens one transaction per event and makes several Stripe API
 * calls inside it, so it holds a checked-out client for as long as Stripe takes
 * to answer. On the shared service pool that starves `assertAccountActive`,
 * which runs on every cookie-authenticated request and is fail-closed, a slow
 * Stripe hour became "Unable to verify account status" for users who never
 * opened the billing page. Isolating it bounds the blast radius to billing.
 *
 * Costs nothing on instances that never receive a webhook: pg opens no
 * connection until the first checkout.
 */
export function getStripeWebhookDb(): DatabaseAdapter {
  if (!webhookDb) {
    webhookDb = createDatabaseClient({
      applicationName: 'agi-web-stripe-webhook',
      onConnectionError: reportDatabaseConnectionError,
      ...WEBHOOK_POOL_TUNING,
    });
  }
  return webhookDb;
}
