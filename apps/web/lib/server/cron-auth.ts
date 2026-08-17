import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';

import { logger } from '@/lib/logger';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function constantTimeEquals(provided: string, expected: string): boolean {
  return timingSafeEqual(digest(provided), digest(expected));
}

export function verifyCronRequest(request: Pick<Request, 'headers'>): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env['CRON_SECRET'];
  const nodeEnv = process.env['NODE_ENV'];
  const devBypass = process.env['CRON_DEV_BYPASS'] === '1';

  if (cronSecret) {
    return constantTimeEquals(authHeader ?? '', `Bearer ${cronSecret}`);
  }

  if (nodeEnv === 'development' && devBypass) {
    const host = (request.headers.get('host') ?? '').toLowerCase();
    const isLoopbackHost =
      host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]');
    if (!isLoopbackHost) {
      logger.error({ nodeEnv, host }, 'CRON_DEV_BYPASS rejected · request not from loopback host');
      return false;
    }
    logger.warn(
      { nodeEnv, host },
      'CRON_SECRET unset; CRON_DEV_BYPASS=1 + loopback host · allowing dev request',
    );
    return true;
  }

  logger.error(
    { nodeEnv, vercelEnv: process.env['VERCEL_ENV'], devBypass },
    'CRON_SECRET not set and CRON_DEV_BYPASS not enabled · denying request',
  );
  return false;
}
