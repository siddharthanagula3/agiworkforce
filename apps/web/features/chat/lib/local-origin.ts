import { isLocalModelId } from '@agiworkforce/local-runtime-contract';
import type { Message } from '@shared/stores/web-chat-store';

export function conversationHoldsLocalTurns(messages: readonly Message[]): boolean {
  return messages.some(
    (message) =>
      message.metadata?.privacyMode === 'local' ||
      (message.model !== undefined && isLocalModelId(message.model)),
  );
}
