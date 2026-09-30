import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

export async function revokeSharesOfDeletedConversations(
  db: Pick<DatabaseAdapter, 'query'>,
  input: { userId: string; organizationId: string | null; conversationId?: string },
): Promise<number> {
  const userId = input.userId?.trim();
  if (!userId) return 0;
  const rows = await db.query<{ token: string }>(
    `delete from public.shared_sessions share
      using public.web_conversations conversation
      where share.owner_id = $1
        and share.conversation_id = conversation.id
        and conversation.user_id = $1
        and conversation.organization_id is not distinct from $2
        and conversation.deleted_at is not null
        and ($3::uuid is null or conversation.id = $3::uuid)
      returning share.token`,
    [userId, input.organizationId, input.conversationId ?? null],
  );
  return rows.length;
}
