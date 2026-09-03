import 'server-only';

import { deriveArtifacts } from '@agiworkforce/artifacts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';

const MAX_INDEXED_TITLE_CHARS = 200;

function boundedTitle(title: string | undefined): string | null {
  const trimmed = title?.trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_INDEXED_TITLE_CHARS
    ? `${trimmed.slice(0, MAX_INDEXED_TITLE_CHARS - 1)}…`
    : trimmed;
}

export async function indexMessageArtifacts(options: {
  db: DatabaseAdapter;
  userId: string;
  conversationId: string;
  messageId: string;
  content: string;
}): Promise<number> {
  const { db, userId, conversationId, messageId, content } = options;

  const derived = deriveArtifacts(content, { conversationId, messageId });

  // Re-indexing is delete-then-insert scoped to this message. The messages
  // route upserts on conflict (a retry re-asserts content), so a second call
  // for the same message must not leave rows describing artifacts that the
  // current content no longer produces.
  await db.execute('delete from web_artifact_index where message_id = $1', [messageId]);

  if (derived.length === 0) return 0;

  await db.execute(
    `insert into web_artifact_index
       (id, user_id, conversation_id, message_id, ordinal, title, artifact_type, language)
     select
       unnest($1::uuid[]), $2::text, $3::uuid, $4::uuid,
       unnest($5::int[]), unnest($6::text[]), unnest($7::text[]), unnest($8::text[])
     on conflict (id) do update
       set title = excluded.title,
           artifact_type = excluded.artifact_type,
           language = excluded.language`,
    [
      derived.map((a) => a.id),
      userId,
      conversationId,
      messageId,
      derived.map((_, i) => i),
      derived.map((a) => boundedTitle(a.title)),
      derived.map((a) => a.type),
      derived.map((a) => a.language ?? null),
    ],
  );

  return derived.length;
}

export function scheduleArtifactIndexing(options: {
  db: DatabaseAdapter;
  userId: string;
  conversationId: string;
  messageId: string;
  content: string;
}): void {
  void indexMessageArtifacts(options).catch((error) => {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        conversationId: options.conversationId,
        messageId: options.messageId,
      },
      '[artifact-index] failed to index message artifacts',
    );
  });
}
