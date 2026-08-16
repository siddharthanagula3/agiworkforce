import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonChatDb } from '@/lib/server/neon-chat';

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
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
