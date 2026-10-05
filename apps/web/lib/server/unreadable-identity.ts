import 'server-only';

import { unstable_rethrow } from 'next/navigation';
import { logger } from '@/lib/logger';

export function reportUnreadableIdentity(error: unknown, route: string): void {
  unstable_rethrow(error);
  logger.error({ error, route }, 'Identity could not be read; serving the signed-out page');
}
