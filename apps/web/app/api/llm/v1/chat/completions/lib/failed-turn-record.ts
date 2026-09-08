import 'server-only';

import { logger } from '@/lib/logger';
import { canPersistAssistantTurn, persistAssistantTurn } from './assistant-turn-persistence';
import type { ProcessedRequest } from './request-processor';

export async function recordFailedTurn(
  processed: ProcessedRequest,
  userId: string,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return;
  if (!canPersistAssistantTurn(processed)) return;
  try {
    await persistAssistantTurn({
      processed,
      userId,
      snapshot: {
        content: '',
        model: processed.chatRequest.model,
        provider: processed.provider,
        inputTokens: 0,
        outputTokens: 0,
        truncated: true,
      },
    });
  } catch (error) {
    logger.error(
      {
        event: 'failed_turn_not_recorded',
        error,
        userId,
        requestId: processed.requestId,
        conversationId: processed.conversationId,
      },
      'The turn failed and the failure itself was not recorded; a reload will have to infer it',
    );
  }
}
