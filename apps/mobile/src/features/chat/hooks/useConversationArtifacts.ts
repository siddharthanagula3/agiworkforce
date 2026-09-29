import { useMemo } from 'react';
import { useArtifactStore } from '@/src/features/artifacts/store';
import { useChatMessageStore, useChatCloudMessageStore } from '@/stores/chatStore';
import type { Artifact } from '@/types/chat';

export function useConversationArtifacts(
  conversationId: string,
  appMode: 'local' | 'cloud',
): Artifact[] {
  const localMessages = useChatMessageStore((s) => s.messages[conversationId]);
  const cloudMessages = useChatCloudMessageStore((s) => s.messages[conversationId]);
  const storedArtifacts = useArtifactStore((s) => s.artifacts);

  return useMemo(() => {
    const messages = (appMode === 'cloud' ? cloudMessages : localMessages) ?? [];
    const order = new Map(messages.map((message, index) => [message.id, index]));
    return storedArtifacts
      .filter(
        (artifact) =>
          artifact.messageId !== undefined &&
          order.has(artifact.messageId) &&
          (artifact.provenance?.scope ?? 'local') === appMode,
      )
      .sort((a, b) => (order.get(a.messageId ?? '') ?? 0) - (order.get(b.messageId ?? '') ?? 0))
      .map((artifact) => ({
        id: artifact.id,
        type: artifact.kind,
        title: artifact.title,
        content: artifact.content,
        ...(artifact.language ? { language: artifact.language } : {}),
      }));
  }, [appMode, cloudMessages, localMessages, storedArtifacts]);
}
