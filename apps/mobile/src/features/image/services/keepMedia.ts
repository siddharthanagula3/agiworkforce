import {
  MANAGED_MEDIA_KEEP_PATH,
  ManagedMediaKeepRequestSchema,
} from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';
import { resolveGeneratedImageUri } from './imagegen';

export const KEEP_IMAGE_LABEL = 'Save to Library';
export const KEPT_IMAGE_MESSAGE = 'Saved to your Library. It stays after this chat is gone.';
export const KEEP_IMAGE_FAILURE_TITLE = 'Could not save to Library';
export const KEEP_IMAGE_UNAVAILABLE = 'This image cannot be saved to your Library.';

const STORED_FILE_ID =
  /\/api\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i;

export function keepableImageId(imageUrl: string): string | null {
  const stored = resolveGeneratedImageUri(imageUrl);
  return stored ? (STORED_FILE_ID.exec(stored)?.[1]?.toLowerCase() ?? null) : null;
}

export async function keepGeneratedImage(imageUrl: string): Promise<string> {
  const id = keepableImageId(imageUrl);
  if (!id) throw new Error(KEEP_IMAGE_UNAVAILABLE);
  await api.post(MANAGED_MEDIA_KEEP_PATH, ManagedMediaKeepRequestSchema.parse({ id }));
  return id;
}
