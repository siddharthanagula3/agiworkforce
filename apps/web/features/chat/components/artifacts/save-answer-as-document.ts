'use client';

import { useCallback } from 'react';
import { documentTitleFromAnswer } from '@agiworkforce/unified-chat/answer-document';
import { useArtifactsStore } from '../../stores/artifacts-store';

export function useSaveAnswerAsDocument() {
  const addArtifact = useArtifactsStore((s) => s.addArtifact);
  const selectArtifact = useArtifactsStore((s) => s.selectArtifact);
  const setPanelOpen = useArtifactsStore((s) => s.setPanelOpen);

  return useCallback(
    (answer: {
      messageId: string;
      conversationId?: string | null;
      content: string;
    }): string | null => {
      const content = answer.content.trim();
      if (!content) return null;
      const id = addArtifact({
        id: crypto.randomUUID(),
        type: 'document',
        title: documentTitleFromAnswer(content),
        language: 'markdown',
        content: `${content}\n`,
        messageId: answer.messageId,
        ...(answer.conversationId ? { conversationId: answer.conversationId } : {}),
      });
      selectArtifact(id);
      setPanelOpen(true);
      return id;
    },
    [addArtifact, selectArtifact, setPanelOpen],
  );
}
