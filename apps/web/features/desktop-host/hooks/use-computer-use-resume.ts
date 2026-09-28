'use client';

import { useEffect, useRef } from 'react';
import type { HostBridge } from '@agiworkforce/local-runtime-contract';
import { selectConversationMessages, useChatStore } from '@shared/stores/web-chat-store';
import { computerUseConversation } from '../lib/computer-use-conversation';
import { desktopChatModelId } from '../lib/desktop-chat-model';
import type { DesktopChatRuntime } from './use-dispatch-task-runner';

const RESUME_PROMPT =
  'I have handed control of the computer back to you. Take a fresh screenshot and carry on from where you stopped.';

function lastAnswerModel(conversationId: string): string | undefined {
  const rows = selectConversationMessages(conversationId)(useChatStore.getState());
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row?.role === 'assistant') return row.model ?? undefined;
  }
  return undefined;
}

export function useComputerUseResume(host: HostBridge, runtime: DesktopChatRuntime): void {
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;

  useEffect(
    () =>
      host.onRuntimeEvent((event) => {
        if (event.kind !== 'computer-use-handed-back') return;
        const conversationId = computerUseConversation();
        if (!conversationId) return;
        const state = useChatStore.getState();
        if (
          state.streamingConversationIds.includes(conversationId) ||
          state.loadingConversationIds.includes(conversationId)
        ) {
          return;
        }
        void runtimeRef.current.sendMessage(RESUME_PROMPT, {
          conversationId,
          model: lastAnswerModel(conversationId) ?? desktopChatModelId(),
        });
      }),
    [host],
  );
}
