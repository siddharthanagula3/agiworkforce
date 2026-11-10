import {
  MANAGED_MEDIA_IMAGE_ASPECT_RATIOS,
  type LibraryItem,
  type ManagedMediaImageAspectRatio,
} from '@agiworkforce/cloud-contracts';
import { libraryItemToFile } from '@features/chat/components/Composer/ComposerFilesMenu';
import { readPersistedDraft } from '@features/chat/components/Composer/composer-draft-storage';
import { composerTextWithIncoming } from '@features/chat/components/Composer/incoming-composer-text';
import { PENDING_CONVERSATION_KEY, useChatStore } from '@shared/stores/web-chat-store';

export type LibraryHandoffMode = 'chat' | 'agiwork';

let stagedAttachments: File[] | null = null;

const ASPECT_RATIO_TOLERANCE = 0.02;

function stageNewChatDraft(incoming: string): void {
  const store = useChatStore.getState();
  const parked = store.getDraftContent(PENDING_CONVERSATION_KEY) || readPersistedDraft(null);
  const next = composerTextWithIncoming(parked, incoming);
  if (next) store.setDraftContent(next, PENDING_CONVERSATION_KEY);
}

async function readImageAspectRatio(image: Blob): Promise<ManagedMediaImageAspectRatio | null> {
  if (typeof createImageBitmap !== 'function') return null;
  const bitmap = await createImageBitmap(image).catch(() => null);
  if (!bitmap) return null;
  const ratio = bitmap.width / bitmap.height;
  bitmap.close();
  return (
    MANAGED_MEDIA_IMAGE_ASPECT_RATIOS.find((candidate) => {
      const [width, height] = candidate.split(':').map(Number);
      return Math.abs(width! / height! - ratio) <= ASPECT_RATIO_TOLERANCE;
    }) ?? null
  );
}

export async function stageLibraryItemForNewChat(
  item: LibraryItem,
  options: { workMode: LibraryHandoffMode; draft?: string },
): Promise<void> {
  const file = await libraryItemToFile(item);
  stagedAttachments = [file];
  const store = useChatStore.getState();
  store.setComposerToggles({ workMode: options.workMode }, PENDING_CONVERSATION_KEY);
  if (options.draft) stageNewChatDraft(options.draft);
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
    {
      workMode: 'chat',
      imageMode: true,
      videoMode: false,
      pendingImageSettings: { modelId: item.model, aspectRatio: await readImageAspectRatio(file) },
    },
    PENDING_CONVERSATION_KEY,
  );
  stageNewChatDraft(item.prompt ?? '');
}

export function takeStagedLibraryAttachments(): File[] | null {
  const staged = stagedAttachments;
  stagedAttachments = null;
  return staged;
}
