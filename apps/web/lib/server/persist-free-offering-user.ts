import 'server-only';

import { NextResponse } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { persistConversationMessage } from '@/app/api/chat/conversations/[id]/messages/lib/persist-message';
import {
  freeOfferingContentText,
  type FreeOfferingMessage,
} from '@/features/models/lib/free-offering-request';
import { logger } from '@/lib/logger';

export async function persistFreeOfferingUser(input: {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
  conversationId: string;
  messages: FreeOfferingMessage[];
  userMessage?: {
    id: string;
    metadata: unknown;
    parent_id?: string | null;
  };
}): Promise<NextResponse | null> {
  const { userMessage } = input;
  if (!userMessage) return null;
  const latestUser = input.messages.findLast((message) => message.role === 'user');
  if (!latestUser) {
    return NextResponse.json(
      { error: { code: 'invalid_user_message', message: 'Your message could not be saved.' } },
      { status: 400 },
    );
  }
  const prompt = freeOfferingContentText(latestUser.content);

  try {
    await persistConversationMessage({
      db: input.db,
      scope: {
        conversationId: input.conversationId,
        userId: input.userId,
        organizationId: input.organizationId,
      },
      message: {
        id: userMessage.id,
        role: 'user',
        content: prompt,
        metadata: userMessage.metadata,
        ...(userMessage.parent_id !== undefined ? { parentId: userMessage.parent_id } : {}),
      },
    });
  } catch (error) {
    logger.error(
      { error, userId: input.userId, conversationId: input.conversationId },
      'Free offering user message could not be persisted before provider dispatch',
    );
    return NextResponse.json(
      {
        error: {
          code: 'user_message_persistence_failed',
          message: 'Your message could not be saved. No model request was sent.',
        },
      },
      { status: 503 },
    );
  }
  return null;
}
