import 'server-only';

/**
 * Lightweight, async conversation-title generation.
 *
 * Two-stage title, same pattern ChatGPT uses:
 *   Stage 1 (synchronous, in route.ts), the first user message is truncated
 *   to ~50 chars and saved immediately, so the sidebar never shows a blank row.
 *   Stage 2 (this module, fire-and-forget), a single cheap, non-streaming LLM
 *   call turns that same message into a short human title and overwrites the
 *   truncated one.
 *
 * `scheduleConversationTitleGeneration` is never awaited by the request that
 * saves the message: a slow or failing provider must not delay or break
 * sending a message. Every failure path here is caught and logged at `warn`;
 * the stage-1 truncated title simply stands.
 */

import { after } from 'next/server';
import { openAIWireRequestToChatRequest } from '@agiworkforce/provider-protocol';
import { resolveAutoRoute } from '@agiworkforce/routing';
import { resolveWireMode } from '@/app/api/llm/v1/chat/completions/lib/adapter-providers';
import { drainToLlmResponse } from '@/app/api/llm/v1/chat/completions/lib/adapter-response';
import {
  buildServerProviderAdapter,
  toGenericUpstreamError,
} from '@/lib/services/provider-adapter-service';
import {
  EXACT_RESPONSE_CACHE_MECHANISM,
  lookupExactResponseCache,
  storeExactResponseCache,
  type ExactResponseCacheKeyFields,
} from '@/lib/services/exact-response-cache-service';
import { assertNoLeaks } from '@/lib/leak-detector';
import { logger } from '@/lib/logger';
import type { getNeonChatDb } from '@/lib/server/neon-chat';

type ChatDb = ReturnType<typeof getNeonChatDb>;

/** ~6 words at temperature 0; generous headroom over the sanitizer's own cap. */
const MAX_OUTPUT_TOKENS = 24;
/** Matches the stage-1 truncation length's spirit; well under the title column's 500-char cap. */
const MAX_TITLE_LENGTH = 60;
/** Cap how much of a (possibly 100k-char) first message is sent to the titler. */
const MAX_SOURCE_CHARS = 4000;

const TITLE_SYSTEM_PROMPT =
  'Write a short title (6 words or fewer) that captures the topic of the message below. ' +
  'Reply with the title text only: no quotes, no markdown, no trailing punctuation, no preamble.';

/**
 * Turn raw model output into something safe to render in the sidebar chrome:
 * collapse newlines/control characters, strip markdown emphasis/heading/quote
 * markers and surrounding quote characters (the model output is UNTRUSTED text
 * rendered into app UI, not raw HTML the browser could execute, but this keeps
 * it inert against markdown renderers and keeps rows on one line), then cap
 * the length. Returns null when nothing usable is left.
 */
export function sanitizeGeneratedTitle(raw: string): string | null {
  const collapsed = raw
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\r\n\t\x00-\x1f\x7f]+/g, ' ')
    .replace(/[*_`#>]+/g, '')
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!collapsed) return null;
  return collapsed.length > MAX_TITLE_LENGTH
    ? `${collapsed.slice(0, MAX_TITLE_LENGTH).trimEnd()}…`
    : collapsed;
}

export interface ScheduleTitleGenerationInput {
  db: ChatDb;
  conversationId: string;
  userId: string;
  organizationId: string | null;
  /** The first user message's raw content (pre-truncation). */
  content: string;
  /**
   * Only overwrite the title while it still holds this exact stage-1 value.
   * a user who has since manually renamed the conversation (or a retried
   * request that scheduled generation twice) must never be clobbered by a
   * stale background result.
   */
  expectedCurrentTitle: string;
}

/**
 * WebChatPage's own client-side auto-title effect (`AUTO_TITLE_PLACEHOLDERS`
 * in features/chat/pages/WebChatPage.tsx) races this generation: it fires the
 * instant a second message renders, reading a LOCAL conversation cache that
 * has not yet learned about this route's stage-1 write (the messages POST
 * response only ever returns `{ message }`), so it still sees the
 * conversation's creation-time placeholder and unconditionally re-truncates
 * the SAME first message to 60 chars via its own PUT
 * (`content.trim().slice(0, 60).replace(/\n/g, ' ')`). That write almost
 * always lands before this generation call returns. Treating ONLY the exact
 * stage-1 string as safe-to-replace would make this feature lose that race on
 * effectively every first message; accepting this second, independently
 * computed candidate as equally safe-to-replace (it is exactly as disposable
 * a placeholder as the stage-1 truncation -- neither is a human's rename)
 * closes that gap without weakening the "never clobber a real rename" rule.
 * The durable fix is in that client effect, not here (outside this file's
 * ownership) -- see remainingWork notes.
 */
function clientTruncatedTitleCandidate(rawContent: string): string {
  return rawContent.trim().slice(0, 60).replace(/\n/g, ' ');
}

async function isTemporaryConversation(
  db: ChatDb,
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db.query<{ is_temporary: boolean }>(
    'select is_temporary from web_conversations where id = $1 and user_id = $2 limit 1',
    [conversationId, userId],
  );
  return row?.is_temporary === true;
}

async function generateAndPersistTitle(input: ScheduleTitleGenerationInput): Promise<void> {
  const source = input.content.trim().slice(0, MAX_SOURCE_CHARS);
  if (!source) return;

  try {
    assertNoLeaks('conversation-title-generation', { content: source });
  } catch {
    // The same content already reached the provider as the real chat turn;
    // a leak-detector hit here just means skipping this nicety, not the
    // message itself.
    return;
  }

  // Cheapest capable route for a one-line utility completion. 'free' tier +
  // 'simple_chat' always resolves to the workhorse economy slot regardless of
  // the requester's actual plan, this is an internal utility call, not a
  // user-facing chat turn, so it must not ride the user's paid model access.
  // Same selection primitive lib/support/agent/answer/model-route.ts uses for
  // its own bounded utility call; no model id is hardcoded here.
  const route = resolveAutoRoute({
    selection: 'auto',
    taskType: 'simple_chat',
    subscriptionTier: 'free',
    trustMode: 'managed_cloud',
    runtimeProfileId: 'web/cloud-chat',
  });
  if (route.status === 'unavailable') {
    logger.warn(
      { code: route.code, conversationId: input.conversationId },
      '[conversation-title] no managed route available; keeping the truncated title',
    );
    return;
  }

  const chatRequest = openAIWireRequestToChatRequest({
    model: route.providerModelId,
    messages: [
      { role: 'system', content: TITLE_SYSTEM_PROMPT },
      { role: 'user', content: source },
    ],
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: 0,
    stream: false,
  });
  const wireMode = resolveWireMode(route.provider);

  const cacheFields: ExactResponseCacheKeyFields = {
    callType: 'conversation-title-generation',
    tenantId: input.userId,
    privacyClass: 'user_private',
    modelId: route.providerModelId,
    route: route.provider,
    systemPrompt: TITLE_SYSTEM_PROMPT,
    input: source,
    temperature: 0,
    responseFormat: 'text',
  };
  const cacheBypass = await isTemporaryConversation(input.db, input.conversationId, input.userId);
  const cacheLookup = await lookupExactResponseCache(cacheFields, { bypass: cacheBypass });

  let title: string | null;
  if (cacheLookup.outcome === 'hit' && cacheLookup.entry) {
    title = sanitizeGeneratedTitle(cacheLookup.entry.content);
  } else {
    try {
      const adapter = buildServerProviderAdapter(route.provider);
      const response = await drainToLlmResponse(
        adapter.stream(chatRequest, new AbortController().signal),
        route.modelKey,
        (chunk) => toGenericUpstreamError(route.provider, chunk),
        wireMode,
      );
      title = sanitizeGeneratedTitle(response.content);
      await storeExactResponseCache(
        cacheFields,
        {
          content: response.content,
          usage: {
            promptTokens: response.promptTokens,
            completionTokens: response.completionTokens,
            totalTokens: response.totalTokens,
            ...(response.reasoningOutputTokens !== undefined
              ? { reasoningOutputTokens: response.reasoningOutputTokens }
              : {}),
            ...(response.cacheCreationInputTokens !== undefined
              ? { cacheCreationInputTokens: response.cacheCreationInputTokens }
              : {}),
            ...(response.cacheCreation1hInputTokens !== undefined
              ? { cacheCreation1hInputTokens: response.cacheCreation1hInputTokens }
              : {}),
            ...(response.cachedInputTokens !== undefined
              ? { cachedInputTokens: response.cachedInputTokens }
              : {}),
          },
        },
        { bypass: cacheBypass },
      );
    } catch (error) {
      logger.warn(
        { error, conversationId: input.conversationId, provider: route.provider },
        '[conversation-title] generation failed; keeping the truncated title',
      );
      return;
    }
  }
  logger.info(
    {
      conversationId: input.conversationId,
      mechanism: EXACT_RESPONSE_CACHE_MECHANISM,
      cacheOutcome: cacheLookup.outcome,
    },
    '[conversation-title] exact-response cache outcome',
  );
  if (!title) return;

  try {
    // Guarded to only the stage-1 truncation and its known client-side racer
    // (see clientTruncatedTitleCandidate above) so this never overwrites a
    // title a human actually chose -- a real rename, or a duplicate
    // scheduling that already won.
    const clientCandidate = clientTruncatedTitleCandidate(input.content);
    await input.db.execute(
      `update web_conversations
          set title = $1, updated_at = now()
        where id = $2
          and user_id = $3
          and organization_id is not distinct from $4
          and (title = $5 or title = $6)
          and deleted_at is null`,
      [
        title,
        input.conversationId,
        input.userId,
        input.organizationId,
        input.expectedCurrentTitle,
        clientCandidate,
      ],
    );
  } catch (error) {
    logger.warn(
      { error, conversationId: input.conversationId },
      '[conversation-title] failed to persist generated title',
    );
  }
}

/**
 * Kick off title generation without making the message-save request wait for
 * it. `after` is the framework's own way of keeping background work alive past
 * the response, it holds the invocation open until the task settles, which a
 * detached promise does not: the platform can suspend the instance at flush and
 * the title is simply never written.
 *
 * This previously read a `waitUntil` member off the request, which NextRequest
 * does not declare and never carries, so the fallback was the only branch ever
 * taken.
 */
export function scheduleConversationTitleGeneration(input: ScheduleTitleGenerationInput): void {
  after(
    generateAndPersistTitle(input).catch((error: unknown) => {
      logger.warn(
        { error, conversationId: input.conversationId },
        '[conversation-title] background task failed',
      );
    }),
  );
}
