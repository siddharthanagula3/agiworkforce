import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createError } from '@/lib/errors';

export type ThreadScope = {
  conversationId: string;
  userId: string;
  organizationId: string | null;
};

// Idempotent on the client-supplied id so a retry of an already-committed
// message does not throw a unique violation or duplicate the row. The
// on-conflict update is scoped to the SAME conversation: a cross-conversation
// id collision (an attacker POSTing a victim's message id into their own
// conversation) matches the WHERE on neither side and returns nothing, so it
// cannot overwrite or read another user's message.
//
// It re-asserts the payload of the retry but never parent_id: a retry carries
// the client's idea of the tree, while the row it collides with may already
// have been re-parented by a splice. Lineage is decided once, by the insert
// that created the row.
export const INSERT_MESSAGE_SQL = `
  insert into web_messages (id, conversation_id, role, content, model, metadata, parent_id)
  values (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6::jsonb, $7::uuid)
  on conflict (id) do update
    set content = excluded.content,
        metadata = excluded.metadata,
        model = excluded.model
    where web_messages.conversation_id = excluded.conversation_id
  returning id, parent_id, role, content, model, provider, input_tokens, output_tokens, created_at, metadata
`;

/**
 * Takes the conversation row lock for the rest of the transaction and reports
 * whether the conversation has been converted to a tree yet.
 *
 * The lock is what makes conversion idempotent under concurrency: two devices
 * creating a first variant at the same moment serialize here, and the second
 * one reads the leaf the first one committed instead of stamping parents a
 * second time.
 */
export async function lockConversationThread(
  tx: DatabaseAdapter,
  scope: ThreadScope,
): Promise<string | null> {
  const [row] = await tx.query<{ active_leaf_message_id: string | null }>(
    `select active_leaf_message_id
       from web_conversations
      where id = $1
        and user_id = $2
        and organization_id is not distinct from $3
        and deleted_at is null
      limit 1
      for update`,
    [scope.conversationId, scope.userId, scope.organizationId],
  );

  if (!row) {
    throw createError.notFound('Conversation not found');
  }
  return row.active_leaf_message_id;
}

export async function assertParentInConversation(
  tx: DatabaseAdapter,
  conversationId: string,
  parentId: string,
): Promise<void> {
  const [parent] = await tx.query<{ id: string }>(
    'select id from web_messages where id = $1 and conversation_id = $2 limit 1',
    [parentId, conversationId],
  );

  if (!parent) {
    throw createError.notFound('Parent message not found');
  }
}

/**
 * Gives a conversation that has only ever been linear the parent pointers its
 * history implies, so the row about to be inserted has something to branch
 * from. Must run before that insert: the new row would otherwise fall inside
 * the same window and be chained onto the transcript instead of branching off
 * it.
 *
 * `parent_id is null` makes it safe to run twice — a conversion that already
 * happened matches no rows.
 */
export async function stampLinearParents(
  tx: DatabaseAdapter,
  conversationId: string,
): Promise<void> {
  await tx.execute(
    `update web_messages as message
        set parent_id = ordered.previous_id
       from (
         select id, lag(id) over (order by created_at, id) as previous_id
           from web_messages
          where conversation_id = $1
       ) as ordered
      where message.id = ordered.id
        and message.conversation_id = $1
        and message.parent_id is null
        and ordered.previous_id is not null`,
    [conversationId],
  );
}

/**
 * The last row of a conversation in the ordering {@link stampLinearParents}
 * chains by, which is the leaf a just-converted conversation has but has never
 * had to record. A write that names no parent of its own continues from here
 * rather than starting a second root.
 */
export async function resolveLinearTail(
  tx: DatabaseAdapter,
  conversationId: string,
): Promise<string | null> {
  const [tail] = await tx.query<{ id: string }>(
    `select id
       from web_messages
      where conversation_id = $1
      order by created_at desc, id desc
      limit 1`,
    [conversationId],
  );
  return tail?.id ?? null;
}

/**
 * Moves the visible path onto a row in the same transaction that created it.
 * Doing it here rather than in a follow-up request closes the window where a
 * crash leaves a sibling nobody can navigate to. Null puts the conversation
 * back to linear, which is the only honest answer once the path is gone.
 *
 * `updated_at` is deliberately untouched: an insert does not bump it today, and
 * the sync cursor rides on the `server_version` trigger, which fires anyway.
 */
export async function setActiveLeaf(
  tx: DatabaseAdapter,
  scope: ThreadScope,
  messageId: string | null,
): Promise<void> {
  await tx.execute(
    `update web_conversations
        set active_leaf_message_id = $1
      where id = $2
        and user_id = $3
        and organization_id is not distinct from $4`,
    [messageId, scope.conversationId, scope.userId, scope.organizationId],
  );
}

// The descent below tracks depth to find the end of a path, so it cannot dedupe
// its way out of a cycle the way the subtree walk can. A parent pointer only
// ever names a row that already existed, so no cycle should exist to find; the
// bound is here so that a row corrupted by something outside these routes costs
// one wrong answer rather than a connection that never returns.
const MAX_THREAD_WALK_DEPTH = 10_000;

const SUBTREE_QUERY_PARAM = 'subtree';
const SUBTREE_QUERY_VALUE = 'true';

export function wantsSubtreeDelete(url: URL): boolean {
  return url.searchParams.get(SUBTREE_QUERY_PARAM) === SUBTREE_QUERY_VALUE;
}

/**
 * Hands a message's children to its own parent, which is what keeps a plain
 * delete looking exactly as it always has: the turn disappears and the ones
 * around it close up. It also has to happen before the delete, because
 * `parent_id` is NO ACTION and Postgres would otherwise refuse the row.
 */
export async function spliceMessageChildren(
  tx: DatabaseAdapter,
  conversationId: string,
  messageId: string,
  parentId: string | null,
): Promise<void> {
  await tx.execute(
    `update web_messages
        set parent_id = $1::uuid
      where conversation_id = $2
        and parent_id = $3`,
    [parentId, conversationId, messageId],
  );
}

export async function collectSubtree(
  tx: DatabaseAdapter,
  conversationId: string,
  messageId: string,
): Promise<string[]> {
  // UNION rather than UNION ALL: it dedupes on the id itself, so the working
  // set cannot exceed the conversation and the walk terminates even if a row
  // somehow points back into its own ancestry.
  const rows = await tx.query<{ id: string }>(
    `with recursive doomed as (
       select id
         from web_messages
        where id = $1
          and conversation_id = $2
       union
       select child.id
         from web_messages child
         join doomed on child.parent_id = doomed.id
        where child.conversation_id = $2
     )
     select id from doomed`,
    [messageId, conversationId],
  );
  return rows.map((row) => row.id);
}

/**
 * Where the reader should land once a variant and everything under it is gone:
 * the end of the newest sibling that survives, or the branch point itself when
 * the deleted variant was the only one left.
 *
 * Descending by newest child at each step matches the pager, which shows the
 * newest variant of a group by default, so the path restored here is the one
 * the reader would have got by paging to that sibling by hand.
 */
export async function resolveSurvivingLeaf(
  tx: DatabaseAdapter,
  conversationId: string,
  messageId: string,
  parentId: string | null,
): Promise<string | null> {
  const [sibling] = await tx.query<{ id: string }>(
    `select id
       from web_messages
      where conversation_id = $1
        and parent_id is not distinct from $2::uuid
        and id <> $3
      order by created_at desc, id desc
      limit 1`,
    [conversationId, parentId, messageId],
  );

  if (!sibling) return parentId;

  const [deepest] = await tx.query<{ id: string }>(
    `with recursive newest_child as (
       select distinct on (parent_id) parent_id, id
         from web_messages
        where conversation_id = $2
          and parent_id is not null
        order by parent_id, created_at desc, id desc
     ),
     chain as (
       select $1::uuid as id, 0 as depth
       union all
       select newest_child.id, chain.depth + 1
         from chain
         join newest_child on newest_child.parent_id = chain.id
        where chain.depth < $3
     )
     select id from chain order by depth desc limit 1`,
    [sibling.id, conversationId, MAX_THREAD_WALK_DEPTH],
  );

  return deepest?.id ?? sibling.id;
}

export async function deleteMessages(
  tx: DatabaseAdapter,
  conversationId: string,
  messageIds: string[],
): Promise<void> {
  await tx.execute('delete from web_messages where conversation_id = $1 and id = any($2::uuid[])', [
    conversationId,
    messageIds,
  ]);
}

export function isHttpError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && ('status' in error || 'statusCode' in error)
  );
}
