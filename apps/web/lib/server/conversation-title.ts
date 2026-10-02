import 'server-only';

import { z } from 'zod';
import { logger } from '@/lib/logger';
import { getCurrentUserRlsDb } from '@/lib/server/rls-db';

const ConversationIdSchema = z.string().uuid();

export async function readOwnConversationTitle(conversationId: string): Promise<string | null> {
  if (!ConversationIdSchema.safeParse(conversationId).success) return null;
  const scoped = await getCurrentUserRlsDb().catch(() => null);
  if (!scoped) return null;
  try {
    const [conversation] = await scoped.db.query<{ title: string | null }>(
      `select title
         from web_conversations
        where id = $1
          and user_id = $2
          and deleted_at is null
        limit 1`,
      [conversationId, scoped.userId],
    );
    return conversation?.title ?? null;
  } catch (error) {
    logger.warn({ error, conversationId }, 'Could not read the conversation title for its tab');
    return null;
  }
}
