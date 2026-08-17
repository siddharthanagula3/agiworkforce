import 'server-only';

import { deriveArtifacts } from '@agiworkforce/artifacts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';

/**
 * Index the artifacts an assistant message produces, so the Artifacts gallery
 * can list a user's whole history instead of only what this device has cached.
 *
 * WHY AN INDEX AND NOT A COPY
 * ---------------------------------------------------------------------------
 * Web artifacts are DERIVED from message markdown, and web has no artifact
 * editing — so every web artifact is re-derivable from content that already
 * syncs. Verified empirically on 2026-08-15: clearing `agi-artifacts-store`
 * from localStorage and reloading a conversation reproduced the artifact under
 * its identical deterministic id. Nothing is lost on a device change.
 *
 * What IS lost is completeness. The client only derives artifacts for
 * conversations it has actually rendered, so after a clear the gallery showed 1
 * artifact where the account had 4 — the other three were waiting behind
 * conversations the device had not reopened yet.
 *
 * That is a discovery problem, so the fix is a metadata index. We deliberately
 * do NOT store `content` here: the bytes stay in the message that produced
 * them, which means this table cannot drift out of sync with its own source.
 * It also keeps us on the right side of migration 0039's rule that re-derivable
 * artifacts are never copied into the managed `web_artifacts` entity.
 *
 * The row is keyed by the SAME deterministic id the client computes
 * (`uuidv5(conversationId:messageId:ordinal)`), so an index row and a
 * locally-derived artifact are the same object and de-duplicate on merge with
 * no reconciliation step.
 */
/**
 * Titles are a display label, not content — but `deriveArtifacts` falls back to
 * a slice of the block when a block has no extractable title (a mermaid diagram
 * titles itself "graph TD; A-->B;"). Cap it so an untitled artifact cannot
 * quietly turn this metadata-only table into a store of content fragments.
 */
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

  // One statement, unnested — a message with several fenced blocks should not
  // cost several round trips.
  await db.execute(
    `insert into web_artifact_index
       (id, user_id, conversation_id, message_id, ordinal, title, artifact_type, language)
     select
       unnest($1::uuid[]), $2, $3, $4,
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

/**
 * Fire-and-forget wrapper. Indexing is a discovery aid, never a correctness
 * requirement — the artifact still renders in its conversation whether or not
 * the index row exists, and the index can be rebuilt from messages at any time.
 * So a failure here must never fail, delay, or roll back saving the message the
 * user just sent.
 */
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
