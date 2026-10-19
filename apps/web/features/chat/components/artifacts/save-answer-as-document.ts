'use client';

import { useCallback } from 'react';
import { normalizeArtifactTitle, useArtifactsStore } from '../../stores/artifacts-store';

export const SAVE_ANSWER_AS_DOCUMENT_LABEL = 'Save as document';
const FALLBACK_TITLE = 'Saved answer';
const TITLE_WORDS = 8;

export function documentTitleFromAnswer(content: string): string {
  const heading = /^#{1,6}\s+(.+)$/m.exec(content)?.[1];
  const firstLine = content.split('\n').find((line) => line.trim().length > 0) ?? '';
  const source = (heading ?? firstLine)
    .replace(/[*_`#>[\]()!]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .trim();
  const words = source.split(/\s+/).filter(Boolean);
  const title = words.slice(0, TITLE_WORDS).join(' ') + (words.length > TITLE_WORDS ? '…' : '');
  return normalizeArtifactTitle(title) || FALLBACK_TITLE;
}

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
