import type { LibraryItem } from '@agiworkforce/cloud-contracts';
import { libraryItemToFile } from '@features/chat/components/Composer/ComposerFilesMenu';
import { PENDING_CONVERSATION_KEY, useChatStore } from '@shared/stores/web-chat-store';

export type LibraryHandoffMode = 'chat' | 'agiwork';

let stagedAttachments: File[] | null = null;

export async function stageLibraryItemForNewChat(
  item: LibraryItem,
  options: { workMode: LibraryHandoffMode; draft?: string },
): Promise<void> {
  const file = await libraryItemToFile(item);
  stagedAttachments = [file];
  const store = useChatStore.getState();
  store.setComposerToggles({ workMode: options.workMode }, PENDING_CONVERSATION_KEY);
  if (options.draft) store.setDraftContent(options.draft, PENDING_CONVERSATION_KEY);
}

export function takeStagedLibraryAttachments(): File[] | null {
  const staged = stagedAttachments;
  stagedAttachments = null;
  return staged;
}
