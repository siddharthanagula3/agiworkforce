/**
 * Composer paste/drop/attachment policy (COMPOSER-002, UI-81).
 *
 * Framework-neutral so every composer surface can share one decision instead of
 * hand-writing its own: the web composer, the shared unified-chat `ChatInput`,
 * and the Chrome extension side panel all call into here. Mobile's threshold is
 * the reference value, see apps/mobile/src/features/chat/components/ChatInput.tsx.
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

/**
 * `items` is what a paste populates; `files` is what a drop populates most
 * reliably. Reading only one of them silently drops attachments on the other
 * surface, so both are consulted before giving up.
 */
export function filesFromDataTransfer(transfer: DataTransfer | null | undefined): File[] {
  if (!transfer) return [];
  const files: File[] = [];
  const items = transfer.items;
  if (items) {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item || item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  if (files.length > 0) return files;
  const dropped = transfer.files;
  if (!dropped) return files;
  for (let index = 0; index < dropped.length; index += 1) {
    const file = dropped[index];
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
  { kind: 'files'; files: File[] } | { kind: 'attachment'; file: File } | { kind: 'text' };

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

export const PASTED_HTML_MIME_TYPE = 'text/html';

export const CODE_FENCE = '```';

const MINIMUM_CODE_LINES = 2;
const MINIMUM_CODE_SIGNAL_LINES = 2;
const MINIMUM_CODE_SIGNAL_RATIO = 0.5;

const CODE_LINE_SIGNALS: readonly RegExp[] = [
  /^[ \t]{2,}\S/,
  /[{};]\s*$/,
  /^\s*(?:\/\/|#|\/\*|\*\/|--|<!--)/,
  /^\s*(?:import|export|from|package|use|using|require|include|#include)\b/,
  /^\s*(?:function|const|let|var|class|struct|enum|interface|type|def|fn|func|impl|trait|module|public|private|protected|static|async|return|yield|await|throw)\b/,
  /^\s*(?:if|for|while|switch|match|case|elif|else|try|catch|except|finally|with|do)\b[\s(:]/,
  /^\s*(?:select|insert|update|delete|create|alter|drop)\s+\w+/i,
  /^\s*[\w$.[\]"']+\s*(?:=|:=|=>|->|\+=|-=)\s*\S/,
  /^\s*<\/?[a-zA-Z][\w:-]*(?:\s|>|\/>)/,
  /^\s*[)\]}]+[;,]?\s*$/,
];

const SHEBANG_LANGUAGES: readonly (readonly [RegExp, string])[] = [
  [/^#!.*\bpython[\d.]*\b/, 'python'],
  [/^#!.*\bnode\b/, 'javascript'],
  [/^#!.*\b(?:ba|z|k)?sh\b/, 'bash'],
  [/^#!.*\bruby\b/, 'ruby'],
  [/^#!.*\bperl\b/, 'perl'],
];

const HTML_CODE_CONTAINER_PATTERN = /<(?:pre|code)[\s>]/i;
const HTML_LANGUAGE_CLASS_PATTERN = /\b(?:language|lang|highlight-source)-([a-z0-9+#]+)\b/i;

function codeSignalScore(lines: readonly string[]): { signals: number; populated: number } {
  let signals = 0;
  let populated = 0;
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    populated += 1;
    if (CODE_LINE_SIGNALS.some((pattern) => pattern.test(line))) signals += 1;
  }
  return { signals, populated };
}

function pastedCodeLanguage(text: string, html: string): string {
  for (const [pattern, language] of SHEBANG_LANGUAGES) {
    if (pattern.test(text)) return language;
  }
  const classMatch = HTML_LANGUAGE_CLASS_PATTERN.exec(html);
  return classMatch?.[1]?.toLowerCase() ?? '';
}

/**
 * Whether a paste is source code rather than prose. Line-shape signals decide
 * it; a clipboard `text/html` payload that came out of a `<pre>`/`<code>` block
 * lowers the line bar, because copying one line out of a code viewer is still a
 * code paste.
 */
export function looksLikePastedCode(text: string, html = ''): boolean {
  if (text.includes(CODE_FENCE)) return false;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const { signals, populated } = codeSignalScore(lines);
  if (populated === 0) return false;
  const fromCodeContainer = HTML_CODE_CONTAINER_PATTERN.test(html);
  if (populated < MINIMUM_CODE_LINES && !fromCodeContainer) return false;
  if (signals < (fromCodeContainer ? 1 : MINIMUM_CODE_SIGNAL_LINES)) return false;
  return signals / populated >= MINIMUM_CODE_SIGNAL_RATIO;
}

/**
 * The fenced block a code paste should become, or `null` when the paste is
 * prose and belongs in the message box untouched. Callers apply it only after
 * `decideComposerPaste` has returned `text`, so a large paste still becomes an
 * attachment and clipboard files still win.
 */
export function pastedCodeFence(
  transfer: DataTransfer | null | undefined,
  options: { threshold?: number } = {},
): { text: string; language: string } | null {
  if (!transfer) return null;
  const raw = transfer.getData(PASTED_TEXT_MIME_TYPE) ?? '';
  if (isLargePaste(raw, options.threshold)) return null;
  const text = raw.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
  if (text.length === 0) return null;
  const html = transfer.getData(PASTED_HTML_MIME_TYPE) ?? '';
  if (!looksLikePastedCode(text, html)) return null;
  const language = pastedCodeLanguage(text, html);
  return { text: `${CODE_FENCE}${language}\n${text}\n${CODE_FENCE}`, language };
}
