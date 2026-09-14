import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { collectMessageResearchSources } from '@/features/chat/utils/research-sources';
import {
  FOLLOW_UP_SUGGESTIONS_METADATA_KEY,
  generateFollowUpSuggestions,
} from '../../lib/generate-follow-ups';
import { logger } from '@/lib/logger';

type RouteContext = { params: Promise<{ id: string; messageId: string }> };

function cachedSuggestions(metadata: Record<string, unknown> | null): string[] | null {
  const stored = metadata?.[FOLLOW_UP_SUGGESTIONS_METADATA_KEY];
  if (!Array.isArray(stored)) return null;
  const suggestions = stored.filter((entry): entry is string => typeof entry === 'string');
  return suggestions.length > 0 ? suggestions : null;
}

async function handleGenerateFollowUps(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-message');
  if (rateLimitResponse) return rateLimitResponse;

  const { id: conversationId, messageId } = await context.params;

  const [conversation] = await db.query<{ id: string }>(
    `select id
       from web_conversations
      where id = $1
        and user_id = $2
        and organization_id is not distinct from $3
        and deleted_at is null
      limit 1`,
    [conversationId, userId, organizationId],
  );
  if (!conversation) throw createError.notFound('Conversation not found');

  const [message] = await db.query<{
    content: string;
    role: string;
    metadata: Record<string, unknown> | null;
  }>(
    `select content, role, metadata
       from web_messages
      where id = $1 and conversation_id = $2
      limit 1`,
    [messageId, conversationId],
  );
  if (!message) throw createError.notFound('Message not found');
  if (message.role !== 'assistant') {
    throw createError.validation('Follow-ups are generated for an assistant turn');
  }

  const cached = cachedSuggestions(message.metadata);
  if (cached) return NextResponse.json({ suggestions: cached, cached: true });

  const { searchSources } = collectMessageResearchSources(message.metadata ?? undefined);
  if (searchSources.length === 0) {
    return NextResponse.json({ suggestions: [], cached: false });
  }

  const subscription = await SubscriptionService.getSubscription(db, userId);
  const suggestions = await generateFollowUpSuggestions({
    db,
    userId,
    organizationId,
    planTier: subscription?.plan_tier ?? 'free',
    conversationId,
    messageId,
    answer: message.content,
    sourceTitles: searchSources.map((source) => source.title || source.url),
    signal: request.signal,
  });

  if (suggestions.length === 0) {
    return NextResponse.json({ suggestions: [], cached: false });
  }

  // Cached on the turn that produced them so a reload never pays for a second
  // generation. A failed write costs a regeneration, never the answer.
  try {
    await db.execute(
      `update web_messages
          set metadata = coalesce(metadata, '{}'::jsonb) || $1::jsonb
        where id = $2 and conversation_id = $3`,
      [
        JSON.stringify({ [FOLLOW_UP_SUGGESTIONS_METADATA_KEY]: suggestions }),
        messageId,
        conversationId,
      ],
    );
  } catch (error) {
    logger.warn({ error, messageId }, '[follow-ups] suggestions could not be cached on the turn');
  }

  return NextResponse.json({ suggestions, cached: false });
}

export const POST = withCorsRoute(withErrorHandler(handleGenerateFollowUps));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
