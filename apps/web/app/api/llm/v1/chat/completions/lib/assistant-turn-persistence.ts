import 'server-only';

import { readPersistedInteractiveCards } from '@agiworkforce/cloud-contracts';
import { INTERACTIVE_CARDS_METADATA_KEY, type InteractiveCard } from '@agiworkforce/types';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { logger } from '@/lib/logger';
import {
  isRoutingRedirectUrl,
  resolveRoutingRedirectUrls,
  type RedirectResolutionOverrides,
} from '@/lib/web-search/web-search-tool';
import { scheduleArtifactIndexing } from '@/app/api/chat/conversations/[id]/messages/lib/index-artifacts';
import {
  lockConversationThread,
  messageExists,
  resolveAnsweredParentId,
  setActiveLeaf,
} from '@/app/api/chat/conversations/[id]/messages/lib/message-thread';
import type {
  PersistedTurnCitation,
  PersistedTurnCodeExecution,
  PersistedTurnGeneratedFile,
  PersistedTurnSource,
} from './assistant-turn-sources';
import type { ProcessedRequest } from './request-processor';

export const TRUNCATED_ASSISTANT_TURN_REASON = 'stream_cancelled';

// parent_id is absent from the on-conflict set-list for the same reason it is
// in INSERT_MESSAGE_SQL: lineage is decided once, by the insert that created
// the row. A retry re-asserts the payload, never the tree.
const INSERT_ASSISTANT_TURN_SQL = `insert into web_messages
         (id, conversation_id, role, content, model, provider, input_tokens, output_tokens, metadata, parent_id)
       select $1::uuid, c.id, 'assistant', $3::text, $4::text, $5::text,
              $6::integer, $7::integer, $8::jsonb, $11::uuid
         from public.web_conversations c
        where c.id = $2::uuid
          and c.user_id = $9
          and c.organization_id is not distinct from $10::uuid
          and c.deleted_at is null
       on conflict (id) do update
          set content = excluded.content,
              model = excluded.model,
              provider = excluded.provider,
              input_tokens = excluded.input_tokens,
              output_tokens = excluded.output_tokens,
              metadata = web_messages.metadata || excluded.metadata
        where web_messages.conversation_id = excluded.conversation_id`;

// Both scoped through web_conversations for the same reason the insert is: the
// claimed RLS role is the first gate, this join is the second, and a row whose
// conversation this user does not own matches nothing rather than erroring.
const SELECT_ASSISTANT_TURN_METADATA_SQL = `select m.metadata
         from web_messages m
         join public.web_conversations c on c.id = m.conversation_id
        where m.id = $1::uuid
          and c.id = $2::uuid
          and c.user_id = $3
          and c.organization_id is not distinct from $4::uuid
          and c.deleted_at is null
        limit 1`;

const PATCH_ASSISTANT_TURN_SOURCE_URLS_SQL = `update web_messages m
          set metadata = m.metadata || $4::jsonb
         from public.web_conversations c
        where m.id = $1::uuid
          and m.conversation_id = c.id
          and c.id = $2::uuid
          and c.user_id = $3
          and c.organization_id is not distinct from $5::uuid
          and c.deleted_at is null`;

export interface AssistantTurnSnapshot {
  content: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  truncated: boolean;
  /**
   * The pages this turn cited. Written under the same `searchResults` key the
   * client uses, so a reload after a failed client save renders the source
   * chips instead of an answer that looks unsourced.
   */
  sources?: readonly PersistedTurnSource[];
  /**
   * The pages the model cited, in marker order, under the same `citations` key
   * the client uses. Without it a reloaded answer renders `[n]` markers with
   * nothing behind them whenever the cited outlet was not also in the searched
   * list.
   */
  citations?: readonly PersistedTurnCitation[];
  /**
   * What a code-execution run printed, under the same `codeExecutionResult` key
   * the client uses. Without it a reloaded answer that said "the script prints
   * 42" showed no result panel at all, so the claim had nothing behind it.
   */
  codeExecutionResult?: PersistedTurnCodeExecution;
  /**
   * The files the turn attached, under the same `generatedFiles` key the client
   * uses. The bytes were already persisted and downloadable; only the row that
   * points at them was lost, so a reload dropped every chart and download chip
   * off an answer whose text still referred to them.
   */
  generatedFiles?: readonly PersistedTurnGeneratedFile[];
  interactiveCards?: readonly InteractiveCard[];
  runReference?: {
    runId: string;
    runPath: string;
    lastSequence: number;
    state?: string;
  };
}

/**
 * True when this turn can be persisted server-side at all. Exported so callers
 * can skip building an expensive snapshot for a turn that would be dropped.
 */
export function canPersistAssistantTurn(processed: ProcessedRequest): boolean {
  return Boolean(
    processed.conversationId && processed.assistantMessageId && !processed.conversationIsTemporary,
  );
}

export async function persistAssistantTurn(params: {
  processed: ProcessedRequest;
  userId: string;
  snapshot: AssistantTurnSnapshot;
}): Promise<void> {
  const { processed, userId, snapshot } = params;
  const conversationId = processed.conversationId;
  const messageId = processed.assistantMessageId;

  if (!conversationId) return;
  if (processed.conversationIsTemporary) return;
  if (!messageId) {
    logger.warn(
      {
        event: 'assistant_turn_not_server_persisted',
        userId,
        requestId: processed.requestId,
        conversationId,
      },
      'Assistant turn was not persisted server-side: the request carried no assistant_message_id, and inventing one would duplicate the client-saved row',
    );
    return;
  }

  const interactiveCards = readPersistedInteractiveCards({
    [INTERACTIVE_CARDS_METADATA_KEY]: snapshot.interactiveCards,
  });
  if (
    !snapshot.content.trim() &&
    !snapshot.truncated &&
    !snapshot.runReference &&
    !snapshot.sources?.length &&
    !snapshot.citations?.length &&
    !snapshot.codeExecutionResult &&
    !snapshot.generatedFiles?.length &&
    interactiveCards.length === 0
  ) {
    return;
  }

  const metadata: Record<string, unknown> = {
    serverPersisted: true,
    requestId: processed.requestId,
    provider: snapshot.provider,
    ...(snapshot.truncated
      ? { truncated: true, truncationReason: TRUNCATED_ASSISTANT_TURN_REASON }
      : {}),
    ...(snapshot.runReference ? { cloudAgentRun: snapshot.runReference } : {}),
    // The on-conflict set-list merges with `||`, so a client save that lands
    // later overwrites this key with its own richer copy. This is the floor,
    // not a competing writer.
    ...(snapshot.sources?.length ? { searchResults: snapshot.sources } : {}),
    ...(snapshot.citations?.length ? { citations: snapshot.citations } : {}),
    ...(snapshot.codeExecutionResult ? { codeExecutionResult: snapshot.codeExecutionResult } : {}),
    ...(snapshot.generatedFiles?.length ? { generatedFiles: snapshot.generatedFiles } : {}),
  };
  if (interactiveCards.length > 0) {
    metadata[INTERACTIVE_CARDS_METADATA_KEY] = interactiveCards;
  }

  const threadScope = {
    conversationId,
    userId,
    organizationId: processed.organizationId ?? null,
  };
  const insertParams = (parentId: string | null): unknown[] => [
    messageId,
    conversationId,
    snapshot.content,
    snapshot.model,
    snapshot.provider,
    Math.max(0, Math.trunc(snapshot.inputTokens)),
    Math.max(0, Math.trunc(snapshot.outputTokens)),
    JSON.stringify(metadata),
    userId,
    threadScope.organizationId,
    parentId,
  ];

  try {
    // This runs after the response, and for a cancelled stream after the request
    // context is gone, so there is no session left for the RLS pool to bind. The
    // scope is claimed from the user id the turn itself carries, which the caller
    // resolved while the request still had one.
    const db = createClaimedUserScopedDb(getNeonDb(), {
      userId,
      organizationId: threadScope.organizationId,
    });
    const [conversation] = await db.query<{ active_leaf_message_id: string | null }>(
      `select active_leaf_message_id
         from web_conversations
        where id = $1
          and user_id = $2
          and organization_id is not distinct from $3
          and deleted_at is null
        limit 1`,
      [conversationId, userId, threadScope.organizationId],
    );

    // A conversation nobody has branched takes the single statement it always
    // has, and a conversation this request cannot see falls through it to the
    // same zero-row no-op rather than to a lock that would throw.
    const affected =
      (conversation?.active_leaf_message_id ?? null) === null
        ? await db.execute(INSERT_ASSISTANT_TURN_SQL, insertParams(null))
        : await db.transaction(async (tx) => {
            const lockedLeafMessageId = await lockConversationThread(tx, threadScope);
            // The branch this request read was undone before it owned the lock,
            // so the conversation is linear again and takes the linear write.
            if (lockedLeafMessageId === null) {
              return tx.execute(INSERT_ASSISTANT_TURN_SQL, insertParams(null));
            }

            // Probed before the insert: afterwards the row exists either way,
            // and a replay is no longer distinguishable from a first write.
            const alreadyWritten = await messageExists(tx, conversationId, messageId);
            const parentId = await resolveAnsweredParentId(tx, conversationId, lockedLeafMessageId);
            const written = await tx.execute(INSERT_ASSISTANT_TURN_SQL, insertParams(parentId));

            // A replay must not drag the visible path back onto a turn the
            // reader has already moved past: a cloud agent run can settle long
            // after the client saved this same row and the conversation went on.
            if (written > 0 && !alreadyWritten) {
              await setActiveLeaf(tx, threadScope, messageId);
            }
            return written;
          });

    // Same fire-and-forget contract as the client-save path
    // (scheduleArtifactIndexing in messages/route.ts): a discovery aid, never a
    // correctness requirement, so a failure here must never surface to the
    // turn that already completed. Gated on affected > 0, the INSERT is a
    // SELECT ... FROM web_conversations WHERE user/org match, so a mismatch
    // silently inserts nothing, and indexing a message that was never written
    // would violate web_artifact_index's FK on message_id.
    if (affected > 0) {
      scheduleArtifactIndexing({
        db,
        userId,
        conversationId,
        messageId,
        content: snapshot.content,
      });
    }
  } catch (error) {
    logger.error(
      {
        event: 'assistant_turn_persist_failed',
        error,
        userId,
        requestId: processed.requestId,
        conversationId,
      },
      'Assistant turn could not be persisted server-side; the client copy remains the only record',
    );
  }
}

/**
 * The two metadata keys whose contents are hrefs a reader can follow. The rest
 * of the row is left alone: nothing else on it is a citation.
 */
const SOURCE_URL_METADATA_KEYS = ['searchResults', 'citations'] as const;

/**
 * Bounds the two walks below. Both shapes these keys hold are two or three
 * levels deep, and the client's own save writes this metadata, so the input is
 * user-controlled and a cycle-free but very deep object must not be able to
 * exhaust the stack on a request that has already been answered.
 */
const SOURCE_URL_WALK_MAX_DEPTH = 8;

/** The driver hands back jsonb as a parsed object, but a text column as a string. */
function asMetadataRecord(value: unknown): Record<string, unknown> | null {
  const parsed = (() => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  })();
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

function collectRoutingRedirects(value: unknown, into: Set<string>, depth = 0): void {
  if (depth > SOURCE_URL_WALK_MAX_DEPTH) return;
  if (typeof value === 'string') {
    if (isRoutingRedirectUrl(value)) into.add(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) collectRoutingRedirects(entry, into, depth + 1);
  } else if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) collectRoutingRedirects(entry, into, depth + 1);
  }
}

/**
 * Substitutes leaf strings and nothing else. No entry is added, removed, merged
 * or reordered, even when two redirects resolve to the same publisher page, so
 * the `[n]` markers in the answer already on the reader's screen keep counting
 * to the same entries. It is also why the stored shape does not have to be
 * known: `searchResults` is an array on one path and a `{ results, sources }`
 * object on another, and both survive this untouched apart from their hrefs.
 */
function remapRoutingRedirects(
  value: unknown,
  publisherUrlByRedirect: ReadonlyMap<string, string>,
  depth = 0,
): unknown {
  if (depth > SOURCE_URL_WALK_MAX_DEPTH) return value;
  if (typeof value === 'string') return publisherUrlByRedirect.get(value) ?? value;
  if (Array.isArray(value)) {
    return value.map((entry) => remapRoutingRedirects(entry, publisherUrlByRedirect, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        remapRoutingRedirects(entry, publisherUrlByRedirect, depth + 1),
      ]),
    );
  }
  return value;
}

/**
 * Replace the routing-provider redirects on an already-written turn with the
 * publisher URLs they point at.
 *
 * A plain grounded turn has no ingestion hop: its sources go from the provider
 * frame through the assembler to the client untouched, so the href persisted
 * with the row is Google's `grounding-api-redirect` link, which expires. The
 * research path resolves this while it ingests; here there is nothing to ingest,
 * and resolution is a network call that must not sit between the last token and
 * `[DONE]`. So the row is written first with the URLs the turn arrived with, and
 * this runs once the stream is closed and rewrites them in place.
 *
 * `sources` and `citations` are the wire evidence, and they are only the gate: a
 * turn that cited no redirect costs neither a read nor a network call. What is
 * rewritten is whatever the row actually holds by then, because the client's own
 * richer save may already have landed on top of the server's copy and must not
 * be replaced by it.
 *
 * A URL that cannot be resolved keeps the redirect it had: that link is dead
 * only once it expires, while an invented or emptied href is dead immediately.
 */
export async function patchAssistantTurnSourceUrls(params: {
  processed: ProcessedRequest;
  userId: string;
  sources?: readonly PersistedTurnSource[] | undefined;
  citations?: readonly PersistedTurnCitation[] | undefined;
  overrides?: RedirectResolutionOverrides;
}): Promise<void> {
  const { processed, userId, sources, citations, overrides } = params;
  const conversationId = processed.conversationId;
  const messageId = processed.assistantMessageId;
  if (!canPersistAssistantTurn(processed) || !conversationId || !messageId) return;

  const citedARedirect = [...(sources ?? []), ...(citations ?? [])].some((entry) =>
    isRoutingRedirectUrl(entry.url),
  );
  if (!citedARedirect) return;

  const organizationId = processed.organizationId ?? null;
  try {
    const db = createClaimedUserScopedDb(getNeonDb(), { userId, organizationId });
    const [row] = await db.query<{ metadata: unknown }>(SELECT_ASSISTANT_TURN_METADATA_SQL, [
      messageId,
      conversationId,
      userId,
      organizationId,
    ]);
    const stored = asMetadataRecord(row?.metadata);
    if (!stored) return;

    const storedRedirects = new Set<string>();
    for (const key of SOURCE_URL_METADATA_KEYS)
      collectRoutingRedirects(stored[key], storedRedirects);
    if (storedRedirects.size === 0) return;

    const redirects = [...storedRedirects];
    const resolved = await resolveRoutingRedirectUrls(
      redirects.map((url) => ({ url })),
      overrides ?? {},
    );
    const publisherUrlByRedirect = new Map<string, string>();
    redirects.forEach((redirect, index) => {
      const publisherUrl = resolved[index]?.url;
      if (publisherUrl && publisherUrl !== redirect) {
        publisherUrlByRedirect.set(redirect, publisherUrl);
      }
    });
    if (publisherUrlByRedirect.size === 0) return;

    const patch: Record<string, unknown> = {};
    for (const key of SOURCE_URL_METADATA_KEYS) {
      if (stored[key] !== undefined) {
        patch[key] = remapRoutingRedirects(stored[key], publisherUrlByRedirect);
      }
    }
    await db.execute(PATCH_ASSISTANT_TURN_SOURCE_URLS_SQL, [
      messageId,
      conversationId,
      userId,
      JSON.stringify(patch),
      organizationId,
    ]);
  } catch (error) {
    logger.error(
      {
        event: 'assistant_turn_citation_patch_failed',
        error,
        userId,
        requestId: processed.requestId,
        conversationId,
      },
      'Resolved citation URLs could not be written; the persisted turn keeps the provider redirects',
    );
  }
}

export function extractAssistantTextDelta(value: Uint8Array): string {
  const text = new TextDecoder().decode(value);
  let out = '';
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
    try {
      const payload = JSON.parse(line.slice(6)) as {
        choices?: Array<{ delta?: { content?: unknown } }>;
      };
      for (const choice of payload.choices ?? []) {
        if (typeof choice.delta?.content === 'string') out += choice.delta.content;
      }
    } catch {
      // Non-JSON/custom SSE lines carry no assistant prose.
    }
  }
  return out;
}
