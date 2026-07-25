import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonChatDb } from '@/lib/server/neon-chat';

// Purges Temporary Chat conversations (Cloud mode) after ~30 days. Temporary
// Chat is excluded from local history on-device, but Cloud-mode messages are
// still persisted to Neon so the model has context during the session; this
// job bounds that server-side retention per
// docs/products/agi-mobile/volume-23-settings.md ("Temporary Chat").
// Hard-deletes rather than soft-deleting (deleted_at) since temporary
// conversations were never meant to be recoverable or visible in trash.
// `web_messages` goes with it via `on delete cascade`.
//
// PER-25 (tracked gap, not silently ignored): files ATTACHED to or GENERATED
// inside a purged temporary conversation are not removed here, because
// `media_assets` carries no conversation reference — verified against every
// writer (`uploads/chat-attachment/complete`, `media/image/generate`,
// `generated-file-persist`), and `LibraryView` documents the same absence.
// Those rows stay owner-scoped and visible in the Library, where the user can
// delete them (which now removes the bytes: see
// `/api/cron/purge-deleted-media`), and account deletion erases them
// unconditionally (`lib/server/account-erasure.ts`). Closing the gap properly
// requires the upload/generation writers to record `metadata.conversationId`;
// inventing a join here would delete the wrong rows.
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
