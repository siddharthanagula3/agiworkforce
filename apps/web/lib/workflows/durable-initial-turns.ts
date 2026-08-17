import 'server-only';

import { logger } from '@/lib/logger';

export const DURABLE_INITIAL_TURNS_ENV = 'AGI_DURABLE_INITIAL_TURNS';

export function areDurableInitialTurnsEnabled(): boolean {
  const raw = process.env[DURABLE_INITIAL_TURNS_ENV]?.trim().toLowerCase();
  const engaged = raw === '0' || raw === 'false' || raw === 'off';

  if (engaged) {
    logger.warn(
      { env: DURABLE_INITIAL_TURNS_ENV },
      '[durable-initial-turns] kill-switch engaged; new agent turns run request-scoped and die with the connection',
    );
    return false;
  }

  return true;
}
