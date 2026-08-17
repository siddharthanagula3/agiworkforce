/**
 * Shared large-paste policy (COMPOSER-002).
 *
 * Web, the shared composer and mobile must agree on one threshold, otherwise
 * the same 20,000-character paste becomes a tidy attachment on one surface and
 * a wall of text in the textarea on another. Mobile's value is the reference —
 * see apps/mobile/src/features/chat/components/ChatInput.tsx.
 */
export const LARGE_PASTE_THRESHOLD = 10_000;

export const PASTED_TEXT_MIME_TYPE = 'text/plain';

const PASTED_TEXT_NAME_PATTERN = /^Pasted text(?: \d+)?\.txt$/;

export function isLargePaste(text: string, threshold: number = LARGE_PASTE_THRESHOLD): boolean {
  return text.length >= threshold;
}

export function isPastedTextFileName(fileName: string): boolean {
  return PASTED_TEXT_NAME_PATTERN.test(fileName);
}

export function pastedTextFileName(sequence = 1): string {
  return sequence <= 1 ? 'Pasted text.txt' : `Pasted text ${sequence}.txt`;
}

/**
 * The attachment a large paste should become, or `null` when the paste is
 * small enough to insert as ordinary text.
 *
 * `.txt` / `text/plain` is deliberate: it is already an accepted chat
 * attachment type, so the returned File travels the existing upload path
 * instead of needing a parallel "pasted text" transport.
 */
export function largePasteToFile(
  text: string,
  options: { threshold?: number; existingFileNames?: readonly string[] } = {},
): File | null {
  const { threshold = LARGE_PASTE_THRESHOLD, existingFileNames = [] } = options;
  if (!isLargePaste(text, threshold)) return null;
  const sequence = existingFileNames.filter(isPastedTextFileName).length + 1;
  return new File([text], pastedTextFileName(sequence), { type: PASTED_TEXT_MIME_TYPE });
}
