import type { MobileArtifact } from '@/src/features/artifacts/types';
import type { LibraryImage } from '@/src/features/library/collectGeneratedImages';
import type { ChatMessage, ConversationSummary } from '@/types/chat';

export interface SearchableMobileProject {
  id: string;
  name: string;
  description?: string | null;
}

export interface MobileGlobalSearchResult {
  id: string;
  title: string;
  subtitle: string;
  targetId?: string;
}

export interface SearchableMobileFile {
  id: string;
  conversationId: string;
  fileName: string;
  mimeType: string;
  conversationTitle: string;
  uri: string;
  fileSize?: number;
  assetId?: string;
}

export interface MobileGlobalSearchGroups {
  chats: MobileGlobalSearchResult[];
  projects: MobileGlobalSearchResult[];
  files: MobileGlobalSearchResult[];
  library: MobileGlobalSearchResult[];
  artifacts: MobileGlobalSearchResult[];
}

function includesQuery(query: string, ...values: Array<string | null | undefined>): boolean {
  return values.some((value) => value?.toLocaleLowerCase().includes(query));
}

/**
 * Builds the visible global-search projection from already-authorized stores.
 * Callers own Local/Cloud filtering before passing data into this pure helper.
 */
export function buildMobileGlobalSearchGroups(input: {
  query: string;
  conversations: ReadonlyArray<ConversationSummary>;
  conversationContentMatchIds: ReadonlySet<string>;
  projects: ReadonlyArray<SearchableMobileProject>;
  files: ReadonlyArray<SearchableMobileFile>;
  libraryImages: ReadonlyArray<LibraryImage>;
  artifacts: ReadonlyArray<MobileArtifact>;
}): MobileGlobalSearchGroups {
  const query = input.query.trim().toLocaleLowerCase();
  if (!query) {
    return { chats: [], projects: [], files: [], library: [], artifacts: [] };
  }

  return {
    chats: input.conversations
      .filter(
        (conversation) =>
          includesQuery(query, conversation.title, conversation.lastMessage) ||
          input.conversationContentMatchIds.has(conversation.id),
      )
      .map((conversation) => ({
        id: conversation.id,
        title: conversation.title || 'Untitled chat',
        subtitle: input.conversationContentMatchIds.has(conversation.id)
          ? 'Matched message content'
          : (conversation.lastMessage ?? 'Chat'),
      })),
    projects: input.projects
      .filter((project) => includesQuery(query, project.name, project.description))
      .map((project) => ({
        id: project.id,
        title: project.name,
        subtitle: project.description?.trim() || 'Project',
      })),
    files: input.files
      .filter((file) => includesQuery(query, file.fileName, file.mimeType, file.conversationTitle))
      .map((file) => ({
        id: file.id,
        targetId: file.conversationId,
        title: file.fileName,
        subtitle: `${file.mimeType} · ${file.conversationTitle}`,
      })),
    library: input.libraryImages
      .filter((image) => includesQuery(query, image.prompt, image.sourceLabel))
      .map((image) => ({
        id: image.id,
        title: image.prompt?.trim() || 'Generated image',
        subtitle: image.sourceLabel,
      })),
    artifacts: input.artifacts
      .filter((artifact) =>
        includesQuery(
          query,
          artifact.title,
          artifact.content,
          artifact.sourceLabel,
          artifact.language,
          artifact.kind,
        ),
      )
      .map((artifact) => ({
        id: artifact.id,
        title: artifact.title,
        subtitle: `${artifact.kind} · ${artifact.sourceLabel}`,
      })),
  };
}

/**
 * Projects the attachments already present in authorized transcripts into
 * searchable file rows without copying file bytes or broadening access.
 */
export function collectSearchableMobileFiles(
  conversations: ReadonlyArray<ConversationSummary>,
  messagesByConversation: Readonly<Record<string, ReadonlyArray<ChatMessage>>>,
): SearchableMobileFile[] {
  const files: SearchableMobileFile[] = [];
  const seen = new Set<string>();
  for (const conversation of conversations) {
    const messages = messagesByConversation[conversation.id] ?? [];
    for (const message of messages) {
      for (const [index, attachment] of (message.attachments ?? []).entries()) {
        if (!attachment.fileName.trim()) continue;
        const durableKey =
          attachment.assetId ??
          `${attachment.url}\u0000${attachment.fileName}\u0000${attachment.mimeType}`;
        if (seen.has(durableKey)) continue;
        seen.add(durableKey);
        files.push({
          id: `${message.id}:${index}`,
          conversationId: conversation.id,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType || 'File',
          conversationTitle: conversation.title || 'Untitled chat',
          uri: attachment.url,
          ...(attachment.fileSize != null ? { fileSize: attachment.fileSize } : {}),
          ...(attachment.assetId ? { assetId: attachment.assetId } : {}),
        });
      }
    }
  }
  return files;
}
