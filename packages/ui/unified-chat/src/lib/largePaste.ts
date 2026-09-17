/**
 * The composer paste/drop/attachment policy lives in `@agiworkforce/utils` so
 * the Chrome extension, which cannot depend on this React package, shares the
 * same decision instead of hand-writing its own. This file stays as the import
 * path the React composers already use.
 */
export {
  CODE_FENCE,
  LARGE_PASTE_THRESHOLD,
  PASTED_HTML_MIME_TYPE,
  PASTED_TEXT_MIME_TYPE,
  dataTransferCarriesFiles,
  decideComposerPaste,
  filesFromDataTransfer,
  isLargePaste,
  isPastedTextFileName,
  largePasteToFile,
  looksLikePastedCode,
  pastedCodeFence,
  pastedTextFileName,
} from '@agiworkforce/utils/composer-paste';
export type { ComposerPasteDecision } from '@agiworkforce/utils/composer-paste';
