'use client';

import { isScreenDeviceStep } from '@agiworkforce/local-runtime-contract';
import { useChatStore } from '@shared/stores/web-chat-store';

let conversationId: string | null = null;

export function noteComputerUseConversation(): void {
  const { messagesByConversation } = useChatStore.getState();
  for (const [id, rows] of Object.entries(messagesByConversation)) {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index];
      if (row?.role !== 'assistant') continue;
      const driving = row.metadata?.tools?.some(
        (tool) => tool.status === 'running' && isScreenDeviceStep(tool.name),
      );
      if (driving) {
        conversationId = id;
        return;
      }
      break;
    }
  }
}

export function computerUseConversation(): string | null {
  return conversationId;
}
