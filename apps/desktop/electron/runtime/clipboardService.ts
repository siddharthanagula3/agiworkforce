import { clipboard, nativeImage } from 'electron';
import {
  MAX_CLIPBOARD_TEXT_LENGTH,
  type ClipboardSnapshot,
} from '@agiworkforce/local-runtime-contract';

const IMAGE_TYPE = 'image/png';

async function readImagePng(): Promise<Buffer | null> {
  const items = await clipboard.read();
  const item = items.find((entry) => entry.types.includes(IMAGE_TYPE));
  if (!item) return null;
  const blob = (await item.getType(IMAGE_TYPE)) as Blob;
  return Buffer.from(await blob.arrayBuffer());
}

/**
 * What the clipboard holds right now, read once. The text is bounded because a
 * clipboard can hold a whole file and the composer has to render whatever
 * comes back.
 */
export async function readClipboard(): Promise<ClipboardSnapshot> {
  const [png, text] = await Promise.all([readImagePng(), clipboard.readText()]);
  const textTruncated = text.length > MAX_CLIPBOARD_TEXT_LENGTH;

  const snapshot: ClipboardSnapshot = { textTruncated };
  if (text !== '') {
    snapshot.text = textTruncated ? text.slice(0, MAX_CLIPBOARD_TEXT_LENGTH) : text;
  }
  if (png && png.length > 0) {
    const size = nativeImage.createFromBuffer(png).getSize();
    snapshot.image = { base64: png.toString('base64'), width: size.width, height: size.height };
  }
  return snapshot;
}
