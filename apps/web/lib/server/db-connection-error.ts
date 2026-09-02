import 'server-only';

import type { DatabaseConnectionErrorEvent } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';

/**
 * A dropped Neon WebSocket is reported, never thrown. The driver's pool
 * re-emits transport failures as EventEmitter `error` events, which Node turns
 * into a process kill when nothing is listening — on a warm cron instance that
 * ended the invocation rather than the one query it broke.
 *
 * Route context rides along through the logger's trace mixin when a request is
 * on the stack. An idle connection failing between invocations has none, and
 * `applicationName` is then the only thing that says which pool died.
 */
export function reportDatabaseConnectionError(event: DatabaseConnectionErrorEvent): void {
  logger.error(
    { scope: event.scope, applicationName: event.applicationName, err: event.error },
    'Neon connection transport error',
  );
}
