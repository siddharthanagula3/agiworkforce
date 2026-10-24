'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirmAction } from '@agiworkforce/ui';
import { useLocalModelSelection } from '@features/desktop-host';
import { conversationHoldsLocalTurns } from '@features/chat/lib/local-turn';
import { useChatStore } from '@shared/stores/web-chat-store';

export const LOCAL_FORK_TITLE = 'Start a new chat for a cloud model?';
export const LOCAL_FORK_DESCRIPTION =
  'This chat holds answers from a model on this device. They stay on this Mac and are never uploaded. Continuing on a cloud model opens a new chat, so nothing local is sent to AGI Cloud.';
export const LOCAL_FORK_CONFIRM_LABEL = 'Start a new chat';

const NEW_CHAT_HREF = '/chat';

export interface LeaveLocalModel {
  leaveLocalModel: (apply?: () => void) => void;
  dialog: React.ReactNode;
}

/**
 * Leaving a local model is a boundary change, not a preference change.
 *
 * Once this chat holds an answer computed on this Mac, continuing it on a
 * cloud model would upload that answer as context. The fork is the consent the
 * trust rules require, and it is a new chat rather than a silent send. Shared
 * so the model picker and the composer's attachment refusal cannot offer two
 * different ways back to the cloud.
 */
export function useLeaveLocalModel(onPrompt?: () => void): LeaveLocalModel {
  const selectLocalModel = useLocalModelSelection((state) => state.select);
  const chatHoldsLocalTurns = useChatStore((state) => conversationHoldsLocalTurns(state.messages));
  const { confirm, dialog } = useConfirmAction();
  const router = useRouter();

  const leaveLocalModel = useCallback(
    (apply?: () => void) => {
      if (!chatHoldsLocalTurns) {
        selectLocalModel(null);
        apply?.();
        return;
      }
      onPrompt?.();
      confirm({
        title: LOCAL_FORK_TITLE,
        description: LOCAL_FORK_DESCRIPTION,
        confirmLabel: LOCAL_FORK_CONFIRM_LABEL,
        onConfirm: () => {
          selectLocalModel(null);
          apply?.();
          router.push(NEW_CHAT_HREF);
        },
      });
    },
    [chatHoldsLocalTurns, confirm, onPrompt, router, selectLocalModel],
  );

  return { leaveLocalModel, dialog };
}
