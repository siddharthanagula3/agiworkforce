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
      provider: 'neon',
      applicationName: 'agi-web',
      onConnectionError: reportDatabaseConnectionError,
      ...SERVICE_POOL_TUNING,
    });
  }
  return db;
}

export function getStripeWebhookDb(): DatabaseAdapter {
  if (!webhookDb) {
    webhookDb = createDatabaseClient({
      provider: 'neon',
      applicationName: 'agi-web-stripe-webhook',
      onConnectionError: reportDatabaseConnectionError,
      ...WEBHOOK_POOL_TUNING,
    });
  }
  return webhookDb;
}
