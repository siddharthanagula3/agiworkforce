import { NextRequest, NextResponse } from 'next/server';
import {
  INTERACTIVE_CARDS_METADATA_KEY,
  type ClarifyAnswer,
  type ClarifyCardBody,
  type ClarifyQuestion,
  type InteractiveCard,
  type InteractiveCardResponsePayload,
} from '@agiworkforce/types';
import {
  parseInteractiveCardDelta,
  readPersistedInteractiveCards,
} from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { normalizeMessageMetadata } from '@/lib/server/neon-chat';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  InteractiveCardResponseRequestSchema,
  interactiveCardAcceptsResponse,
} from '../response-contract';

function findQuestion(body: ClarifyCardBody, questionId: string): ClarifyQuestion {
  const question = body.questions.find((candidate) => candidate.id === questionId);
  if (!question) {
    throw createError.validation('Response answers a question this card never asked');
  }
  return question;
}

function toClarifyAnswer(
  question: ClarifyQuestion,
  entry: { question_id: string; option_ids?: string[]; text?: string; skipped?: boolean },
): ClarifyAnswer {
  const text = entry.text?.trim() ?? '';
  const optionIds = entry.option_ids ?? [];
  if (entry.skipped || (text.length === 0 && optionIds.length === 0)) {
    return { questionId: question.id, kind: 'skipped' };
  }
  if (text.length > 0) {
    return { questionId: question.id, kind: 'other', text };
  }
  const labels = optionIds.map((optionId) => {
    const option = question.options.find((candidate) => candidate.id === optionId);
    if (!option) {
      throw createError.validation('Response selects an option this card never offered');
    }
    return option.label;
  });
  return { questionId: question.id, kind: 'options', optionIds, labels };
}

function settleClarifyBody(
  body: ClarifyCardBody,
  payload: InteractiveCardResponsePayload,
  settledAt: string,
): ClarifyCardBody {
  if (payload.kind === 'dismiss') {
    const freeText = payload.text?.trim() ?? '';
    return {
      ...body,
      state: {
        status: 'dismissed',
        dismissedAt: settledAt,
        ...(freeText.length > 0 ? { freeText } : {}),
      },
    };
  }

  const answered = new Set<string>();
  const answers = payload.answers.map((entry) => {
    if (answered.has(entry.question_id)) {
      throw createError.validation('Response answers the same question twice');
    }
    answered.add(entry.question_id);
    return toClarifyAnswer(findQuestion(body, entry.question_id), entry);
  });

  return { ...body, state: { status: 'answered', answeredAt: settledAt, answers } };
}

async function handleRespond(request: NextRequest) {
  const { db, userId, organizationId } = await getUserScopedDb(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-message');
  if (rateLimitResponse) return rateLimitResponse;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  const parsed = InteractiveCardResponseRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error);
  }
  const {
    conversation_id: conversationId,
    message_id: messageId,
    card_id: cardId,
    response: payload,
  } = parsed.data;

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

  if (!conversation) {
    throw createError.notFound('Conversation not found');
  }

  const [row] = await db.query<{ metadata: Record<string, unknown> | null }>(
    'select metadata from web_messages where id = $1 and conversation_id = $2 limit 1',
    [messageId, conversationId],
  );

  if (!row) {
    throw createError.notFound('Message not found');
  }

  const cards = readPersistedInteractiveCards(row.metadata);
  const card = cards.find((candidate) => candidate.cardId === cardId);

  if (!card) {
    throw createError.notFound('Interactive card not found');
  }

  if (!interactiveCardAcceptsResponse(card)) {
    throw createError.conflict('This card is no longer accepting a response');
  }

  const settledAt = new Date().toISOString();
  const settledCard = parseInteractiveCardDelta({
    card: { ...card, body: settleClarifyBody(card.body, payload, settledAt) },
  });

  if (!settledCard?.recognized) {
    throw createError.validation('Response does not produce a valid card state');
  }

  const nextCards: InteractiveCard[] = cards.map((candidate) =>
    candidate.cardId === settledCard.cardId ? settledCard : candidate,
  );
  const metadata = normalizeMessageMetadata({
    ...(row.metadata ?? {}),
    [INTERACTIVE_CARDS_METADATA_KEY]: nextCards,
  });

  const updated = await db.execute(
    `update web_messages
        set metadata = $1::jsonb
      where id = $2
        and conversation_id = $3
        and metadata is not distinct from $4::jsonb`,
    [
      JSON.stringify(metadata),
      messageId,
      conversationId,
      row.metadata === null ? null : JSON.stringify(row.metadata),
    ],
  );

  if (updated < 1) {
    throw createError.conflict('This card changed while the response was in flight');
  }

  return NextResponse.json({ ok: true, card: settledCard });
}

export const POST = withCorsRoute(withErrorHandler(handleRespond));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
