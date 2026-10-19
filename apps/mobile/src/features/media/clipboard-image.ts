import * as Clipboard from 'expo-clipboard';
import { EncodingType, cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';
import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';

const DATA_URI = /^data:(image\/(?:png|jpeg));base64,(.+)$/s;

export async function clipboardHasImage(): Promise<boolean> {
  try {
    return await Clipboard.hasImageAsync();
  } catch {
    return false;
  }
}

export async function readClipboardImageAttachment(): Promise<Attachment | null> {
  const image = await Clipboard.getImageAsync({ format: 'png' });
  const match = image ? DATA_URI.exec(image.data) : null;
  if (!image || !match || !cacheDirectory) return null;
  const [, mimeType, base64] = match;
  const createdAt = Date.now();
  const extension = mimeType === 'image/jpeg' ? 'jpg' : 'png';
  const fileName = `pasted-${createdAt}.${extension}`;
  const uri = `${cacheDirectory}${fileName}`;
  await writeAsStringAsync(uri, base64!, { encoding: EncodingType.Base64 });
  return {
    id: `paste-${createdAt}`,
    uri,
    mimeType: mimeType!,
    fileName,
    width: image.size.width,
    height: image.size.height,
  };
}
