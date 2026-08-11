import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

export class ProjectConversationMembershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectConversationMembershipError';
  }
}

/**
 * Replaces the complete conversation membership for one owned project.
 * Callers must invoke this inside the same database transaction as project
 * creation/update so metadata and membership cannot partially commit.
 */
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
    const owned = await db.query<{ id: string }>(
      `select id::text as id
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
          and id::text = any($3::text[])`,
      [params.userId, params.projectId, conversationIds, params.organizationId],
    );
  }
}
