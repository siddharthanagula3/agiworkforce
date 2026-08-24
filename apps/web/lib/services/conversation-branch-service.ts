import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type {
  ManagedCloudConversationBranchGroup,
  ManagedCloudConversationWire,
} from '@agiworkforce/cloud-contracts';
import { createError } from '@/lib/errors';
import { scheduleArtifactIndexing } from '@/app/api/chat/conversations/[id]/messages/lib/index-artifacts';

type CopiedAssistantMessage = {
  id: string;
  content: string;
};

type BranchGroupRow = {
  local_message_id: string | null;
  source_conversation_id: string;
  branch_point_message_id: string;
  source_title: string | null;
  target_conversation_id: string;
  target_title: string | null;
  branch_created_at: string;
};

type BranchCapacityRow = {
  sibling_count: number | string;
  group_count: number | string;
};

type ForkConversationInput = {
  sourceConversationId: string;
  messageId: string;
  requestId: string;
};

const MAX_BRANCHES_PER_FORK = 50;
const MAX_FORK_POINTS_PER_CONVERSATION = 100;

function branchTitle(title: string | null): string {
  const base = title?.trim() || 'Untitled';
  return `${base.slice(0, 491)} (branch)`;
}

async function findIdempotentBranch(
  db: DatabaseAdapter,
  userId: string,
  requestId: string,
): Promise<ManagedCloudConversationWire | null> {
  const [conversation] = await db.query<ManagedCloudConversationWire>(
    `select target.id,
            target.title,
            target.model,
            target.project_id,
            target.pinned,
            target.starred,
            target.archived,
            target.is_temporary,
            target.created_at,
            target.updated_at
       from public.conversation_branches as branch
       join public.web_conversations as target
         on target.id = branch.target_conversation_id
        and target.user_id = $1
        and target.deleted_at is null
      where branch.user_id = $1
        and branch.request_id = $2
      limit 1`,
    [userId, requestId],
  );
  return conversation ?? null;
}

export async function listConversationBranchGroups(
  db: DatabaseAdapter,
  userId: string,
  conversationId: string,
): Promise<ManagedCloudConversationBranchGroup[]> {
  const [ownedConversation] = await db.query<{ id: string }>(
    `select id
       from public.web_conversations
      where id = $1
        and user_id = $2
        and deleted_at is null
      limit 1`,
    [conversationId, userId],
  );
  if (!ownedConversation) throw createError.notFound('Conversation not found');

  const rows = await db.query<BranchGroupRow>(
    `with relevant_groups as (
       select distinct branch.source_conversation_id,
                       branch.branch_point_message_id
         from public.conversation_branches as branch
        where branch.user_id = $2
          and branch.branch_point_message_id is not null
          and (
            branch.source_conversation_id = $1
            or branch.target_conversation_id = $1
          )
     )
     select case
              when group_row.source_conversation_id = $1
                then group_row.branch_point_message_id
              else active_map.target_message_id
            end as local_message_id,
            group_row.source_conversation_id,
            group_row.branch_point_message_id,
            source.title as source_title,
            member.target_conversation_id,
            target.title as target_title,
            member.created_at as branch_created_at
       from relevant_groups as group_row
       join public.conversation_branches as member
         on member.source_conversation_id = group_row.source_conversation_id
        and member.branch_point_message_id = group_row.branch_point_message_id
        and member.user_id = $2
       join public.web_conversations as source
         on source.id = group_row.source_conversation_id
        and source.user_id = $2
        and source.deleted_at is null
       join public.web_conversations as target
         on target.id = member.target_conversation_id
        and target.user_id = $2
        and target.deleted_at is null
       left join public.conversation_branches as active_branch
         on active_branch.target_conversation_id = $1
        and active_branch.source_conversation_id = group_row.source_conversation_id
        and active_branch.branch_point_message_id = group_row.branch_point_message_id
        and active_branch.user_id = $2
       left join public.conversation_branch_messages as active_map
         on active_map.branch_id = active_branch.id
        and active_map.source_message_id = group_row.branch_point_message_id
      order by group_row.source_conversation_id,
               group_row.branch_point_message_id,
               member.created_at,
               member.id
      limit 5000`,
    [conversationId, userId],
  );

  const groups = new Map<
    string,
    {
      messageId: string;
      activeConversationId: string;
      branches: Map<string, { conversationId: string; title: string }>;
    }
  >();

  for (const row of rows) {
    if (!row.local_message_id) continue;
    const key = `${row.source_conversation_id}:${row.branch_point_message_id}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        messageId: row.local_message_id,
        activeConversationId: conversationId,
        branches: new Map(),
      };
      group.branches.set(row.source_conversation_id, {
        conversationId: row.source_conversation_id,
        title: row.source_title?.trim() || 'Untitled',
      });
      groups.set(key, group);
    }
    group.branches.set(row.target_conversation_id, {
      conversationId: row.target_conversation_id,
      title: row.target_title?.trim() || 'Untitled',
    });
  }

  return [...groups.values()].flatMap((group) => {
    const branches = [...group.branches.values()];
    if (branches.length < 2 || branches.length > MAX_BRANCHES_PER_FORK) return [];
    return [{ ...group, branches }];
  });
}

export async function forkConversation(
  db: DatabaseAdapter,
  userId: string,
  input: ForkConversationInput,
): Promise<ManagedCloudConversationWire> {
  // The transaction's `tx` adapter is bound to a pooled connection that is
  // released the moment the callback below returns (NeonDatabaseAdapter.
  // transaction() calls client.release() in its `finally`), so indexing must
  // be scheduled with the outer `db` AFTER commit, never with `tx` inside the
  // callback -- firing it there would run against a connection the pool may
  // have already handed to an unrelated request.
  let copiedAssistantMessages: CopiedAssistantMessage[] = [];

  const target = await db.transaction(async (tx) => {
    const existing = await findIdempotentBranch(tx, userId, input.requestId);
    if (existing) return existing;

    const [source] = await tx.query<ManagedCloudConversationWire>(
      `select id,
              title,
              model,
              project_id,
              pinned,
              starred,
              archived,
              is_temporary,
              created_at,
              updated_at
         from public.web_conversations
        where id = $1
          and user_id = $2
          and deleted_at is null
        limit 1
        for update`,
      [input.sourceConversationId, userId],
    );
    if (!source) throw createError.notFound('Conversation not found');

    const [forkPoint] = await tx.query<{ id: string }>(
      `select message.id
         from public.web_messages as message
         join public.web_conversations as conversation
           on conversation.id = message.conversation_id
          and conversation.user_id = $3
          and conversation.deleted_at is null
        where message.id = $1
          and message.conversation_id = $2
        limit 1`,
      [input.messageId, input.sourceConversationId, userId],
    );
    if (!forkPoint) throw createError.notFound('Fork-point message not found');

    const [capacity] = await tx.query<BranchCapacityRow>(
      `select count(*) filter (
                where branch.branch_point_message_id = $2
              )::int as sibling_count,
              count(distinct branch.branch_point_message_id)::int as group_count
         from public.conversation_branches as branch
        where branch.source_conversation_id = $1
          and branch.user_id = $3`,
      [input.sourceConversationId, input.messageId, userId],
    );
    const siblingCount = Number(capacity?.sibling_count ?? 0);
    const groupCount = Number(capacity?.group_count ?? 0);
    if (siblingCount >= MAX_BRANCHES_PER_FORK - 1) {
      throw createError.validation('This message already has the maximum number of branches');
    }
    if (siblingCount === 0 && groupCount >= MAX_FORK_POINTS_PER_CONVERSATION) {
      throw createError.validation('This conversation already has the maximum number of forks');
    }

    const [target] = await tx.query<ManagedCloudConversationWire>(
      `insert into public.web_conversations
         (id, user_id, title, model, project_id, is_temporary)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (id) do nothing
       returning id,
                 title,
                 model,
                 project_id,
                 pinned,
                 starred,
                 archived,
                 is_temporary,
                 created_at,
                 updated_at`,
      [
        input.requestId,
        userId,
        branchTitle(source.title),
        source.model,
        source.project_id,
        source.is_temporary,
      ],
    );

    if (!target) {
      const raced = await findIdempotentBranch(tx, userId, input.requestId);
      if (raced) return raced;
      throw createError.validation('Branch request id is already in use');
    }

    await tx.execute(
      `insert into public.conversation_branches
         (id,
          source_conversation_id,
          target_conversation_id,
          branch_point_message_id,
          user_id,
          request_id)
       values ($1, $2, $1, $3, $4, $1)`,
      [input.requestId, input.sourceConversationId, input.messageId, userId],
    );

    // The final SELECT returns the copied assistant rows (id + content) so
    // the caller can index their artifacts once this transaction commits --
    // a forked conversation reuses fresh ids for every copied message, so
    // each one needs its own web_artifact_index row; nothing upstream
    // derives it for free. `branch_map` is joined into that SELECT (rather
    // than left as a bare CTE) so Postgres cannot skip evaluating it: a
    // data-modifying CTE only runs if the primary query's FROM/JOIN chain
    // actually reaches it.
    copiedAssistantMessages = await tx.query<CopiedAssistantMessage>(
      `with ordered_messages as (
         select message.*,
                row_number() over (
                  order by message.created_at, message.id
                ) as message_position
           from public.web_messages as message
          where message.conversation_id = $1
       ),
       fork_position as (
         select message_position
           from ordered_messages
          where id = $2
       ),
       messages_to_copy as materialized (
         select source_message.*,
                gen_random_uuid() as target_message_id
           from ordered_messages as source_message
           cross join fork_position
          where source_message.message_position <= fork_position.message_position
       ),
       inserted_messages as (
         insert into public.web_messages
           (id,
            conversation_id,
            role,
            content,
            model,
            provider,
            input_tokens,
            output_tokens,
            cost_cents,
            metadata,
            created_at)
         select target_message_id,
                $3,
                role,
                content,
                model,
                provider,
                input_tokens,
                output_tokens,
                cost_cents,
                coalesce(metadata, '{}'::jsonb),
                created_at
           from messages_to_copy
          order by message_position
         returning id, role, content
       ),
       branch_map as (
         insert into public.conversation_branch_messages
           (branch_id, source_message_id, target_message_id)
         select $4, source.id, source.target_message_id
           from messages_to_copy as source
           join inserted_messages as inserted
             on inserted.id = source.target_message_id
         returning target_message_id
       )
       select inserted_messages.id, inserted_messages.content
         from inserted_messages
         join branch_map
           on branch_map.target_message_id = inserted_messages.id
        where inserted_messages.role = 'assistant'`,
      [input.sourceConversationId, input.messageId, target.id, input.requestId],
    );

    return target;
  });

  for (const message of copiedAssistantMessages) {
    scheduleArtifactIndexing({
      db,
      userId,
      conversationId: target.id,
      messageId: message.id,
      content: message.content,
    });
  }

  return target;
}
