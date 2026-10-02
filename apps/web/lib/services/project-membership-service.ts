import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { TEMPORARY_CHAT_PROJECT_REFUSAL } from '@/lib/temporary-chat-policy';

export class ProjectConversationMembershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectConversationMembershipError';
  }
}

export async function replaceProjectConversationMembership(
  db: DatabaseAdapter,
  params: {
    userId: string;
    organizationId: string | null;
    projectId: string;
    conversationIds: string[];
  },
): Promise<void> {
  const conversationIds = Array.from(new Set(params.conversationIds));
  if (conversationIds.length > 0) {
    const owned = await db.query<{ id: string; is_temporary: boolean | null }>(
      `select id::text as id, is_temporary
         from web_conversations
        where user_id = $1
          and organization_id is not distinct from $3::uuid
          and deleted_at is null
          and id::text = any($2::text[])`,
      [params.userId, conversationIds, params.organizationId],
    );
    if (owned.length !== conversationIds.length) {
      throw new ProjectConversationMembershipError(
        'One or more selected conversations are unavailable.',
      );
    }
    if (owned.some((conversation) => conversation.is_temporary)) {
      throw new ProjectConversationMembershipError(TEMPORARY_CHAT_PROJECT_REFUSAL);
    }
  }

  await db.execute(
    `update web_conversations
        set project_id = null, updated_at = now()
      where user_id = $1
        and project_id = $2
        and organization_id is not distinct from $4::uuid
        and deleted_at is null
        and not (id::text = any($3::text[]))`,
    [params.userId, params.projectId, conversationIds, params.organizationId],
  );

  if (conversationIds.length > 0) {
    await db.execute(
      `update web_conversations
          set project_id = $2, updated_at = now()
        where user_id = $1
          and organization_id is not distinct from $4::uuid
          and deleted_at is null
          and not coalesce(is_temporary, false)
          and id::text = any($3::text[])`,
      [params.userId, params.projectId, conversationIds, params.organizationId],
    );
  }
}
