import 'server-only';

import { estimateTokens } from '@agiworkforce/routing';
import type { AutoRouteDecision } from '@agiworkforce/routing';
import { openAIWireRequestToChatRequest } from '@agiworkforce/provider-protocol';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import {
  buildServerProviderAdapter,
  toGenericUpstreamError,
} from '@/lib/services/provider-adapter-service';
import { resolveWireMode } from './adapter-providers';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import {
  fingerprintManagedUsageRequest,
  finalizeManagedUsageRequest,
  markManagedUsageProviderStarted,
  reserveManagedUsageRequest,
} from '@/lib/services/managed-usage-request-service';
import { drainToLlmResponse } from './adapter-response';
import {
  applyDroppedSpanReplacement,
  DROPPED_HISTORY_MARKER,
  planContextTrim,
  type ContextTrimResult,
  type TrimmableMessage,
} from './context-window';

export const CONTEXT_COMPACTION_ENABLED_ENV = 'AGI_CONTEXT_COMPACTION_ENABLED';

export const MAX_COMPACTION_SUMMARY_CHARS = 2_000;
const MAX_COMPACTION_SUMMARY_OUTPUT_TOKENS = 500;
const MAX_COMPACTION_SOURCE_CHARS = 24_000;

const COMPACTED_HISTORY_PREFIX = '[Earlier messages summarized to fit the model context window: ';

const COMPACTION_SYSTEM_PROMPT =
  'Summarize the conversation excerpt below into a compact reference the assistant can use to ' +
  'continue the conversation. Preserve names, decisions, numbers, and open questions. Drop ' +
  'pleasantries and restated context. Write plain prose: no headings, no bullet points, no preamble.';

const COMPACTION_CONTINUATION_SYSTEM_PROMPT =
  'Update the running summary below with the new messages that follow it, producing one combined ' +
  'summary that still preserves names, decisions, numbers, and open questions from both. Write ' +
  'plain prose: no headings, no bullet points, no preamble.';

export function resolveContextCompactionEnabled(): boolean {
  const configured = process.env[CONTEXT_COMPACTION_ENABLED_ENV]?.trim().toLowerCase();
  return configured !== '0' && configured !== 'false' && configured !== 'off';
}

function truncate(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, Math.max(0, maxChars - 1))}…` : value;
}

function formatCompactedMarker(summary: string): string {
  return `${COMPACTED_HISTORY_PREFIX}${summary}]`;
}

/**
 * `droppedMessages`, sliced from the position where the `startPersistableIndex`-th
 * (0-based) user/assistant message sits. A tool message trailing that user or
 * assistant turn stays attached to it, matching how {@link planContextTrim}
 * never separates the two.
 */
function spanFromPersistableIndex(
  droppedMessages: readonly TrimmableMessage[],
  startPersistableIndex: number,
): TrimmableMessage[] {
  let seen = 0;
  for (let i = 0; i < droppedMessages.length; i++) {
    const message = droppedMessages[i];
    if (message && (message.role === 'user' || message.role === 'assistant')) {
      if (seen === startPersistableIndex) return droppedMessages.slice(i);
      seen += 1;
    }
  }
  return [];
}

interface ConversationCompactionRow {
  compaction_summary: string | null;
  compaction_summary_through_message_id: string | null;
}

async function generateCompactionSummary(params: {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
  planTier: string;
  conversationId: string;
  boundaryMessageId: string;
  priorSummary: string | null;
  spanMessages: readonly TrimmableMessage[];
  resolveEconomyRoute: () => AutoRouteDecision;
}): Promise<string> {
  const route = params.resolveEconomyRoute();
  if (route.status !== 'selected') {
    throw new Error(`no managed route available for context compaction (${route.code})`);
  }

  const transcript = params.spanMessages
    .map((message) => `${message.role}: ${message.content}`.trim())
    .filter(Boolean)
    .join('\n\n')
    .slice(0, MAX_COMPACTION_SOURCE_CHARS);

  const systemPrompt = params.priorSummary
    ? COMPACTION_CONTINUATION_SYSTEM_PROMPT
    : COMPACTION_SYSTEM_PROMPT;
  const userContent = params.priorSummary
    ? `Running summary so far:\n${params.priorSummary}\n\nNew messages:\n${transcript}`
    : transcript;

  const chatRequest = openAIWireRequestToChatRequest({
    model: route.providerModelId,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    max_tokens: MAX_COMPACTION_SUMMARY_OUTPUT_TOKENS,
    temperature: 0,
    stream: false,
  });
  const wireMode = resolveWireMode(route.provider);

  const idempotencyKey = `context-compaction:${params.conversationId}:${params.boundaryMessageId}`;
  const requestHash = fingerprintManagedUsageRequest({
    kind: 'context_compaction',
    conversationId: params.conversationId,
    boundaryMessageId: params.boundaryMessageId,
    priorSummary: params.priorSummary,
    provider: route.provider,
    model: route.modelKey,
  });
  const estimatedPromptTokens =
    estimateTokens(`${systemPrompt}\n${userContent}`, route.modelKey) + 32;
  const estimatedCostCents = LLMCostCalculator.estimateCost(
    route.provider,
    route.modelKey,
    estimatedPromptTokens,
    MAX_COMPACTION_SUMMARY_OUTPUT_TOKENS,
  );

  const reservation = await reserveManagedUsageRequest({
    db: params.db,
    userId: params.userId,
    organizationId: params.organizationId,
    idempotencyKey,
    requestHash,
    provider: route.provider,
    model: route.modelKey,
    estimatedCostCents,
    leaseSeconds: 60,
    planTier: params.planTier,
    isFlagship: false,
  });

  let providerCompleted = false;
  try {
    await markManagedUsageProviderStarted(reservation);
    const adapter = buildServerProviderAdapter(route.provider);
    const response = await drainToLlmResponse(
      adapter.stream(chatRequest, new AbortController().signal),
      route.modelKey,
      (chunk) => toGenericUpstreamError(route.provider, chunk),
      wireMode,
    );
    providerCompleted = true;

    const actualCostCents = LLMCostCalculator.calculateCost(route.provider, response.model, {
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
      totalTokens: response.totalTokens,
    });
    await finalizeManagedUsageRequest({
      ...reservation,
      outcome: 'completed',
      actualCostCents,
      usage: {
        type: 'context_compaction',
        conversationId: params.conversationId,
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
        totalTokens: response.totalTokens,
      },
    });

    const summary = truncate(response.content.trim(), MAX_COMPACTION_SUMMARY_CHARS);
    if (!summary) throw new Error('context compaction produced an empty summary');
    return summary;
  } catch (error) {
    if (!providerCompleted) {
      await finalizeManagedUsageRequest({
        ...reservation,
        outcome: 'failed',
        actualCostCents: 0,
        usage: {
          type: 'context_compaction',
          conversationId: params.conversationId,
          reason: error instanceof Error ? error.message : String(error),
        },
      }).catch((releaseError: unknown) => {
        logger.error(
          { releaseError, conversationId: params.conversationId },
          '[context-compaction] reservation release failed',
        );
      });
    }
    throw error;
  }
}

async function resolveCompactionSummary(params: {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
  planTier: string;
  conversationId: string;
  droppedMessages: readonly TrimmableMessage[];
  resolveEconomyRoute: () => AutoRouteDecision;
}): Promise<string> {
  const persistableCount = params.droppedMessages.filter(
    (message) => message.role === 'user' || message.role === 'assistant',
  ).length;
  if (persistableCount === 0) {
    throw new Error(
      'dropped span has no persisted user or assistant message to anchor a boundary to',
    );
  }

  const [conversationRows, persistedIdRows] = await Promise.all([
    params.db.query<ConversationCompactionRow>(
      `select compaction_summary, compaction_summary_through_message_id
         from web_conversations
        where id = $1
          and user_id = $2
        limit 1`,
      [params.conversationId, params.userId],
    ),
    params.db.query<{ id: string }>(
      `select id from web_messages
        where conversation_id = $1 and role in ('user', 'assistant')
        order by created_at asc, id asc
        limit $2`,
      [params.conversationId, persistableCount],
    ),
  ]);

  const ids = persistedIdRows.map((row) => row.id);
  if (ids.length < persistableCount) {
    throw new Error(
      `conversation ${params.conversationId} has fewer persisted messages (${ids.length}) than the drop plan expects (${persistableCount})`,
    );
  }
  const boundaryMessageId = ids[persistableCount - 1];
  if (!boundaryMessageId) throw new Error('could not resolve a compaction boundary message id');

  const cachedSummary = conversationRows[0]?.compaction_summary ?? null;
  const cachedBoundaryId = conversationRows[0]?.compaction_summary_through_message_id ?? null;

  if (cachedSummary && cachedBoundaryId === boundaryMessageId) {
    return cachedSummary;
  }

  let priorSummary: string | null = null;
  let spanMessages = params.droppedMessages;
  if (cachedSummary && cachedBoundaryId) {
    const cachedIndex = ids.indexOf(cachedBoundaryId);
    if (cachedIndex !== -1 && cachedIndex < persistableCount - 1) {
      priorSummary = cachedSummary;
      spanMessages = spanFromPersistableIndex(params.droppedMessages, cachedIndex + 1);
    }
  }

  const summary = await generateCompactionSummary({
    db: params.db,
    userId: params.userId,
    organizationId: params.organizationId,
    planTier: params.planTier,
    conversationId: params.conversationId,
    boundaryMessageId,
    priorSummary,
    spanMessages,
    resolveEconomyRoute: params.resolveEconomyRoute,
  });

  await params.db.execute(
    `update web_conversations
        set compaction_summary = $1,
            compaction_summary_through_message_id = $2
      where id = $3
        and user_id = $4`,
    [summary, boundaryMessageId, params.conversationId, params.userId],
  );

  return summary;
}

export interface ContextCompactionInput {
  messages: TrimmableMessage[];
  model: string;
  maxOutputTokens: number;
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
  conversationId: string | null;
  isTemporary: boolean;
  planTier: string;
  resolveEconomyRoute: () => AutoRouteDecision;
}

/**
 * Trims `input.messages` to fit `input.model`'s context window, same contract
 * as `trimMessagesToContextWindow`: mutates in place, returns null when
 * nothing needed to change.
 *
 * When a trim would drop messages, this tries to replace the mechanical
 * marker with an LLM-produced summary of exactly the dropped span first,
 * cached on the conversation row and reused or extended while later turns
 * keep dropping from the same point. Falls back to the mechanical trim (no
 * summary, no extra managed call) for a temporary conversation, a
 * conversation with no persisted row, the kill switch, or any failure along
 * the way: compaction is always an enhancement over the trim, never a
 * dependency of it.
 */
export async function compactContextWindow(
  input: ContextCompactionInput,
): Promise<ContextTrimResult | null> {
  const plan = planContextTrim(input.messages, input.model, input.maxOutputTokens);
  if (!plan) return null;

  const applyMechanicalTrim = () =>
    applyDroppedSpanReplacement(
      input.messages,
      plan,
      plan.droppedIndices.length > 0 ? DROPPED_HISTORY_MARKER : null,
      input.model,
    );

  if (
    plan.droppedIndices.length === 0 ||
    input.isTemporary ||
    !input.conversationId ||
    !resolveContextCompactionEnabled()
  ) {
    return applyMechanicalTrim();
  }

  const conversationId = input.conversationId;
  try {
    const droppedMessages = plan.droppedIndices
      .map((index) => input.messages[index])
      .filter((message): message is TrimmableMessage => Boolean(message));

    const summary = await resolveCompactionSummary({
      db: input.db,
      userId: input.userId,
      organizationId: input.organizationId,
      planTier: input.planTier,
      conversationId,
      droppedMessages,
      resolveEconomyRoute: input.resolveEconomyRoute,
    });

    return applyDroppedSpanReplacement(
      input.messages,
      plan,
      formatCompactedMarker(summary),
      input.model,
    );
  } catch (error) {
    logger.error(
      { error, conversationId },
      '[context-compaction] summarization failed; falling back to the mechanical trim',
    );
    return applyMechanicalTrim();
  }
}
