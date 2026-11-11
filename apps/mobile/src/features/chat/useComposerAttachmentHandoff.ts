import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import type { ChatInputHandle } from './components/ChatInput';
import { adoptComposerHandoff } from './composerHandoff';

export function useComposerAttachmentHandoff(
  key: string | undefined,
  attachRef: React.RefObject<ChatInputHandle | null>,
): void {
  useFocusEffect(
    useCallback(() => {
      adoptComposerHandoff(key, attachRef.current);
    }, [attachRef, key]),
  );
}
