import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getNeonChatDb } from '@/lib/server/neon-chat';

// Verify cron secret to prevent unauthorized access.
// Mirrors apps/web/app/api/cron/reset-credits/route.ts: CRON_SECRET is the
// only blessed way to authorize a cron call; the dev-mode bypass requires
// both NODE_ENV=development and an explicit CRON_DEV_BYPASS=1 co-flag plus
// a loopback host, so a misconfigured environment variable can't turn this
// into an unauthenticated endpoint.
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env['CRON_SECRET'];
  const nodeEnv = process.env['NODE_ENV'];
  const devBypass = process.env['CRON_DEV_BYPASS'] === '1';

  if (cronSecret) {
    return authHeader === `Bearer ${cronSecret}`;
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

// Purges Temporary Chat conversations (Cloud mode) after ~30 days. Temporary
// Chat is excluded from local history on-device, but Cloud-mode messages are
// still persisted to Neon so the model has context during the session; this
// job bounds that server-side retention per
// docs/products/agi-mobile/volume-23-settings.md ("Temporary Chat").
// Hard-deletes rather than soft-deleting (deleted_at) since temporary
// conversations were never meant to be recoverable or visible in trash.
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const deleted = await getNeonChatDb().query<{ id: string }>(
      `
        delete from web_conversations
        where is_temporary = true and created_at < now() - interval '30 days'
        returning id
      `,
      [],
    );

    logger.info({ count: deleted.length }, 'Purged expired temporary chat conversations');

    return NextResponse.json({
      message: 'Temporary chat purge completed',
      purged: deleted.length,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Temporary chat purge cron job failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
