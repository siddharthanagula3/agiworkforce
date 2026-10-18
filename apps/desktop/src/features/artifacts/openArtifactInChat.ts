import { toast } from 'sonner';
import {
  useChatArtifactStore,
  useChatUIStore,
  type Artifact as ChatArtifact,
} from '@agiworkforce/unified-chat';
import type { Artifact as NativeArtifact } from '@/api/artifacts';
import { resolveArtifactRenderType } from '@/runtime/TauriRuntime';
import { useArtifactStore } from '@/stores/artifactStore';
import { useChatStore, uuidToDbId } from '@/stores/chat/chatStore';

/** A stored Local artifact in the shape the chat's artifact panel renders. */
export function nativeArtifactToChat(native: NativeArtifact): ChatArtifact {
  const metadata = (native.metadata ?? {}) as Record<string, unknown> & {
    Code?: { language?: string };
  };
  return {
    id: native.id,
    type: resolveArtifactRenderType(native.render_type, native.artifact_type),
    title: native.title,
    content: native.content,
    language: metadata.Code?.language,
    version: native.current_version,
    createdAt: native.created_at,
    updatedAt: native.updated_at,
    conversationId:
      native.conversation_id === undefined ? undefined : String(native.conversation_id),
    messageId: native.message_id === undefined ? undefined : String(native.message_id),
    metadata,
  };
}

/**
 * Opens a stored artifact in the chat's artifact panel, in the conversation
 * that made it when that conversation is still listed. This is the one viewer
 * the gallery, search and the chat share.
 */
export async function openArtifactInChat(artifactId: string): Promise<boolean> {
  let native: NativeArtifact | null;
  try {
    native = await useArtifactStore.getState().getArtifact(artifactId);
  } catch (error) {
    native = null;
    console.error('[openArtifactInChat] Failed to load artifact:', error);
  }
  if (!native) {
    toast.error('This artifact could not be opened. It may have been deleted.');
    return false;
  }

  if (native.conversation_id !== undefined) {
    const chat = useChatStore.getState();
    const owner = chat.conversations.find(
      (conversation) => uuidToDbId(conversation.id) === native.conversation_id,
    );
    if (owner) chat.selectConversation(owner.id);
  }
  window.dispatchEvent(new CustomEvent('desktop:navigate-panel', { detail: 'chat' }));
  useChatArtifactStore.getState().openArtifact(nativeArtifactToChat(native));
  useChatUIStore.getState().openArtifactPanel();
  return true;
}
