/**
 * Composer paste/drop/attachment policy (COMPOSER-002, UI-81).
 *
 * Framework-neutral so every composer surface can share one decision instead of
 * hand-writing its own: the web composer, the shared unified-chat `ChatInput`,
 * and the Chrome extension side panel all call into here. Mobile's threshold is
 * the reference value — see apps/mobile/src/features/chat/components/ChatInput.tsx.
 *
 * It takes `DataTransfer`, which is what both a DOM `ClipboardEvent` and a React
 * synthetic clipboard event expose, so no surface has to adapt its event first.
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

export function filesFromDataTransfer(transfer: DataTransfer | null | undefined): File[] {
  const items = transfer?.items;
  if (!items) return [];
  const files: File[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item || item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  return files;
}

export function dataTransferCarriesFiles(transfer: DataTransfer | null | undefined): boolean {
  const types = transfer?.types;
  if (!types) return false;
  for (let index = 0; index < types.length; index += 1) {
    if (types[index] === 'Files') return true;
  }
  return false;
}

export type ComposerPasteDecision =
  | { kind: 'files'; files: File[] }
  | { kind: 'attachment'; file: File }
  | { kind: 'text' };

/**
 * What a composer should do with a paste. `files` and `attachment` mean the
 * surface must call preventDefault and attach; `text` means let the paste land
 * in the textarea untouched.
 */
export function decideComposerPaste(
  transfer: DataTransfer | null | undefined,
  options: { threshold?: number; existingFileNames?: readonly string[] } = {},
): ComposerPasteDecision {
  if (!transfer) return { kind: 'text' };

  const files = filesFromDataTransfer(transfer);
  if (files.length > 0) return { kind: 'files', files };

  const file = largePasteToFile(transfer.getData(PASTED_TEXT_MIME_TYPE) ?? '', options);
  return file ? { kind: 'attachment', file } : { kind: 'text' };
}
