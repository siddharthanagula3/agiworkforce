import { captureCloudAccountEpoch } from '@/src/features/auth/services/cloudAccountSession';
import type {
  MobileArtifactProvenance,
  ScopedMobileArtifact,
} from '@/src/features/artifacts/types';
import { executionModeForConversation } from '@/src/features/chat/utils/conversationMode';
import type { ConversationMessageStore } from '@/stores/chat/conversationRepository';
import type { Artifact, ChatMessage, ConversationSummary } from '@/types/chat';

export const CODE_CARD_EDIT_FAILED = 'Could not open this code for editing. Try again.';

export interface CodeCardEditTarget {
  artifact: Artifact;
  conversationId: string;
  messageId: string;
}

interface FoundMessage {
  message: ChatMessage;
  conversationId: string;
  conversation: ConversationSummary | undefined;
  heldByCloudStore: boolean;
}

function messageStores(): { store: ConversationMessageStore; cloud: boolean }[] {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { useChatMessageStore } =
    require('@/stores/chat/chatMessageStore') as typeof import('@/stores/chat/chatMessageStore');
  const { useChatCloudMessageStore } =
    require('@/stores/chat/chatCloudMessageStore') as typeof import('@/stores/chat/chatCloudMessageStore');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return [
    { store: useChatMessageStore as unknown as ConversationMessageStore, cloud: false },
    { store: useChatCloudMessageStore as unknown as ConversationMessageStore, cloud: true },
  ];
}

function findMessage(messageId: string): FoundMessage | null {
  for (const { store, cloud } of messageStores()) {
    const state = store.getState();
    for (const [conversationId, rows] of Object.entries(state.messages)) {
      const message = rows.find((row) => row.id === messageId);
      if (!message) continue;
      return {
        message,
        conversationId,
        conversation: state.conversations.find((row) => row.id === conversationId),
        heldByCloudStore: cloud,
      };
    }
  }
  return null;
}

function provenanceFor(found: FoundMessage): MobileArtifactProvenance | null {
  const cloud =
    found.heldByCloudStore ||
    (found.conversation !== undefined &&
      executionModeForConversation(found.conversation) === 'cloud');
  if (!cloud) return { scope: 'local' };
  const ownerId = captureCloudAccountEpoch()?.ownerId;
  return ownerId ? { scope: 'cloud', ownerId } : null;
}

function artifactStore(): typeof import('@/src/features/artifacts/store') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/src/features/artifacts/store') as typeof import('@/src/features/artifacts/store');
}

function codeCardArtifact(
  messageId: string,
  code: string,
  language: string | undefined,
): { found: FoundMessage; artifact: ScopedMobileArtifact } | null {
  const found = findMessage(messageId);
  if (!found || found.message.role !== 'assistant' || found.message.isStreaming) return null;
  const provenance = provenanceFor(found);
  if (!provenance) return null;
  const artifact = artifactStore().codeBlockEditorMobileArtifact({
    markdown: found.message.content,
    code,
    language,
    conversationId: found.conversationId,
    messageId,
    createdAt: found.message.createdAt,
    conversationTitle: found.conversation?.title ?? '',
    provenance,
  });
  return artifact ? { found, artifact } : null;
}

function sameOwner(
  stored: MobileArtifactProvenance | undefined,
  card: MobileArtifactProvenance,
): boolean {
  if (!stored) return false;
  if (stored.scope === 'local' || card.scope === 'local') return stored.scope === card.scope;
  return stored.ownerId === card.ownerId;
}

export function savedCodeCardEdit(
  messageId: string,
  code: string,
  language: string | undefined,
): string | null {
  try {
    const card = codeCardArtifact(messageId, code, language);
    if (!card) return null;
    const stored = artifactStore()
      .useArtifactStore.getState()
      .artifacts.find((candidate) => candidate.id === card.artifact.id);
    if (!stored?.editedAt || !sameOwner(stored.provenance, card.artifact.provenance)) return null;
    return stored.content;
  } catch (error) {
    console.warn('[codeCardEdit] The saved edit could not be read:', error);
    return null;
  }
}

export function storeCodeCardForEditing(
  messageId: string,
  code: string,
  language: string | undefined,
): CodeCardEditTarget | null {
  try {
    const card = codeCardArtifact(messageId, code, language);
    if (!card) return null;
    const { useArtifactStore, viewerArtifactFor } = artifactStore();
    useArtifactStore.getState().addArtifacts([card.artifact]);
    const stored = useArtifactStore
      .getState()
      .artifacts.find((candidate) => candidate.id === card.artifact.id);
    if (!stored) return null;
    return {
      artifact: viewerArtifactFor(stored),
      conversationId: card.found.conversationId,
      messageId,
    };
  } catch (error) {
    console.warn('[codeCardEdit] The code could not be stored for editing:', error);
    return null;
  }
}
