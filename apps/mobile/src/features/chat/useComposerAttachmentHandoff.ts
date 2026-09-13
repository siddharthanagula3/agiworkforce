import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import type { ChatInputHandle } from './components/ChatInput';
import { takeComposerAttachments } from './composerHandoff';

export function useComposerAttachmentHandoff(
  key: string | undefined,
  attachRef: React.RefObject<ChatInputHandle | null>,
): void {
  useFocusEffect(
    useCallback(() => {
      if (!key) return;
      const attachments = takeComposerAttachments(key);
      if (attachments.length === 0) return;
      attachRef.current?.addAttachments(attachments);
    }, [attachRef, key]),
  );
}
