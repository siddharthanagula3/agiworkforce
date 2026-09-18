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

/**
 * Start a new image generation from a saved asset.
 *
 * Remixing has only ever been reachable from the card of an image generated in
 * this conversation, so an image from any earlier session was a dead end. This
 * hands the composer the asset, its original prompt and image mode, which is
 * the same state the card's revision panel works from.
 */
export async function stageLibraryItemForImageRemix(item: LibraryItem): Promise<void> {
  if (!item.mime_type.toLowerCase().startsWith('image/')) {
    throw new Error('Only an image can be remixed.');
  }
  const file = await libraryItemToFile(item);
  stagedAttachments = [file];
  const store = useChatStore.getState();
  store.setComposerToggles(
    { workMode: 'chat', imageMode: true, videoMode: false },
    PENDING_CONVERSATION_KEY,
  );
  store.setDraftContent(item.prompt ?? '', PENDING_CONVERSATION_KEY);
}

export function takeStagedLibraryAttachments(): File[] | null {
  const staged = stagedAttachments;
  stagedAttachments = null;
  return staged;
}
