import { clipboard } from 'electron';
import {
  MAX_CLIPBOARD_TEXT_LENGTH,
  type ClipboardSnapshot,
} from '@agiworkforce/local-runtime-contract';

/**
 * What the clipboard holds right now, read once.
 *
 * The image is taken before the text so a copy that carries both lands as the
 * richer of the two, and the text is bounded because a clipboard can hold a
 * whole file and the composer has to render whatever comes back.
 */
export function readClipboard(): ClipboardSnapshot {
  const image = clipboard.readImage();
  const text = clipboard.readText();
  const textTruncated = text.length > MAX_CLIPBOARD_TEXT_LENGTH;

  const snapshot: ClipboardSnapshot = { textTruncated };
  if (text !== '') {
    snapshot.text = textTruncated ? text.slice(0, MAX_CLIPBOARD_TEXT_LENGTH) : text;
  }
  if (!image.isEmpty()) {
    const size = image.getSize();
    snapshot.image = {
      base64: image.toPNG().toString('base64'),
      width: size.width,
      height: size.height,
    };
  }
  return snapshot;
}
