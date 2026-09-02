import 'server-only';

import type { DatabaseConnectionErrorEvent } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';

export function reportDatabaseConnectionError(event: DatabaseConnectionErrorEvent): void {
  logger.error(
    { scope: event.scope, applicationName: event.applicationName, err: event.error },
    'Neon connection transport error',
  );
}
