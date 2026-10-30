import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createError } from '@/lib/errors';
import {
  ASSISTANT_CONTENT_CHANGED_MESSAGE,
  ASSISTANT_CONTENT_CHANGED_REASON,
  ASSISTANT_CONTENT_EDIT_METADATA_KEY,
} from '@/features/chat/lib/assistant-content-edit-contract';

function assistantContentWriteAllowedSql(metadata: '$6' | '$8'): string {
  return `(
  not (coalesce(web_messages.metadata, '{}'::jsonb) ? '${ASSISTANT_CONTENT_EDIT_METADATA_KEY}')
  or (
    web_messages.role = 'assistant'
    and excluded.role = 'assistant'
    and jsonb_typeof(web_messages.metadata -> '${ASSISTANT_CONTENT_EDIT_METADATA_KEY}') = 'string'
    and (${metadata}::jsonb -> '${ASSISTANT_CONTENT_EDIT_METADATA_KEY}')
      = (web_messages.metadata -> '${ASSISTANT_CONTENT_EDIT_METADATA_KEY}')
    and left(excluded.content, char_length(web_messages.content)) = web_messages.content
  )
)`;
}

export const CLIENT_ASSISTANT_CONTENT_WRITE_ALLOWED_SQL = assistantContentWriteAllowedSql('$6');
export const SERVER_ASSISTANT_CONTENT_WRITE_ALLOWED_SQL = assistantContentWriteAllowedSql('$8');

function preservedEditMetadataSql(
  current: 'web_messages' | 'existing',
  incoming: 'excluded' | 'incoming',
): string {
  const incomingMetadata =
    incoming === 'incoming'
      ? 'case when incoming.has_metadata then incoming.metadata else existing.metadata end'
      : 'excluded.metadata';
  const revision =
    incoming === 'incoming'
      ? `case when existing.content is distinct from incoming.content
        then to_jsonb(gen_random_uuid()::text)
        else existing.metadata -> '${ASSISTANT_CONTENT_EDIT_METADATA_KEY}' end`
      : `web_messages.metadata -> '${ASSISTANT_CONTENT_EDIT_METADATA_KEY}'`;
  return `(
  case
    when coalesce(${current}.metadata, '{}'::jsonb) ? '${ASSISTANT_CONTENT_EDIT_METADATA_KEY}'
    then (coalesce(nullif(${incomingMetadata}, 'null'::jsonb), '{}'::jsonb) - '${ASSISTANT_CONTENT_EDIT_METADATA_KEY}')
      || jsonb_build_object('${ASSISTANT_CONTENT_EDIT_METADATA_KEY}', ${revision})
    when jsonb_typeof(${incomingMetadata}) = 'object'
    then (${incomingMetadata}) - '${ASSISTANT_CONTENT_EDIT_METADATA_KEY}'
    else ${incomingMetadata}
  end
)`;
}

export const ASSISTANT_CONTENT_PRESERVED_METADATA_SQL = preservedEditMetadataSql(
  'web_messages',
  'excluded',
);
export const SYNC_ASSISTANT_CONTENT_PRESERVED_METADATA_SQL = preservedEditMetadataSql(
  'existing',
  'incoming',
);

export const SAVE_ASSISTANT_CONTENT_EDIT_SQL = `update web_messages
   set content = $1,
       metadata = coalesce(metadata, '{}'::jsonb)
         || jsonb_build_object('${ASSISTANT_CONTENT_EDIT_METADATA_KEY}', $5::text)
 where id = $2 and conversation_id = $3 and role = 'assistant'
   and deleted_at is null and content = $4
 returning content, metadata ->> '${ASSISTANT_CONTENT_EDIT_METADATA_KEY}' as edit_revision`;

interface EditedAssistantContentScope {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
  conversationId: string;
  messageId: string;
}

export function assistantContentChangedError() {
  const error = createError.conflict(ASSISTANT_CONTENT_CHANGED_MESSAGE);
  error.details = { reason: ASSISTANT_CONTENT_CHANGED_REASON };
  return error;
}

export interface EditedAssistantContent {
  content: string;
  editRevision: string;
}

export async function readEditedAssistantContent(
  scope: EditedAssistantContentScope,
): Promise<EditedAssistantContent | null> {
  const [row] = await scope.db.query<{ content: string; edit_revision: unknown }>(
    `select message.content,
            message.metadata -> '${ASSISTANT_CONTENT_EDIT_METADATA_KEY}' as edit_revision
       from web_messages as message
       join web_conversations as conversation on conversation.id = message.conversation_id
      where message.id = $1::uuid
        and message.conversation_id = $2::uuid
        and conversation.user_id = $3
        and conversation.organization_id is not distinct from $4::uuid
        and conversation.deleted_at is null
        and message.role = 'assistant'
        and message.deleted_at is null
        and coalesce(message.metadata, '{}'::jsonb) ? '${ASSISTANT_CONTENT_EDIT_METADATA_KEY}'
      limit 1`,
    [scope.messageId, scope.conversationId, scope.userId, scope.organizationId],
  );
  if (!row) return null;
  if (
    typeof row.content !== 'string' ||
    typeof row.edit_revision !== 'string' ||
    !row.edit_revision
  ) {
    throw assistantContentChangedError();
  }
  return { content: row.content, editRevision: row.edit_revision };
}

export async function assertAssistantContinuationSeed(
  scope: EditedAssistantContentScope & { seed: string | null },
): Promise<EditedAssistantContent | null> {
  const content = await readEditedAssistantContent(scope);
  if (content !== null && scope.seed !== content.content) throw assistantContentChangedError();
  return content;
}

export async function refuseEditedAssistantOverwrite(
  scope: Omit<EditedAssistantContentScope, 'messageId'> & { messageId?: string | null },
): Promise<void> {
  if (!scope.messageId) return;
  if ((await readEditedAssistantContent({ ...scope, messageId: scope.messageId })) !== null) {
    throw assistantContentChangedError();
  }
}
