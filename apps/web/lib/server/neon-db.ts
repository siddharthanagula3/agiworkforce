import 'server-only';

import { createDatabaseClient } from '@agiworkforce/data-layer';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

let db: DatabaseAdapter | null = null;

export function getNeonDb(): DatabaseAdapter {
  if (!db) {
    db = createDatabaseClient({
      provider: 'neon',
      applicationName: 'agi-web',
    });
  }
  return db;
}
