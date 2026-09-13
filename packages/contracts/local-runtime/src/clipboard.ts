export const CLIPBOARD_COMMANDS = ['clipboard_read'] as const;

export type ClipboardCommand = (typeof CLIPBOARD_COMMANDS)[number];

export const MAX_CLIPBOARD_TEXT_LENGTH = 500_000;

export interface ClipboardImage {
  /** PNG bytes, base64, because the response crosses IPC as structured JSON. */
  base64: string;
  width: number;
  height: number;
}

/**
 * What the clipboard held at the moment the user asked for it.
 *
 * Both members are optional and both can be present: a copied region of a
 * spreadsheet carries text and an image, and the caller decides which one the
 * composer should attach.
 */
export interface ClipboardSnapshot {
  text?: string;
  image?: ClipboardImage;
  textTruncated: boolean;
}

export function isEmptyClipboard(snapshot: ClipboardSnapshot): boolean {
  return !snapshot.image && (snapshot.text ?? '') === '';
}
