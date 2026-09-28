export type DiffLineType = 'add' | 'remove' | 'context' | 'meta';

export interface DiffLine {
  type: DiffLineType;
  content: string;
}

export interface FileDiff {
  filePath?: string;
  lines: DiffLine[];
  additions: number;
  deletions: number;
}

const UNIFIED_HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m;
const PATCH_ENVELOPE_HEADER = /^\*\*\* (?:Begin Patch|Add File|Update File|Delete File)\b/m;
const DIFF_META_PREFIXES = ['@@', '--- ', '+++ ', 'diff ', 'index ', '*** ', '\\ No newline'];
const FILE_PATH_KEYS = ['path', 'file_path', 'filePath', 'file', 'target_file'];
const OLD_TEXT_KEYS = ['old_text', 'oldText', 'old_string', 'oldString', 'before'];
const NEW_TEXT_KEYS = ['new_text', 'newText', 'new_string', 'newString', 'after'];

export function looksLikeUnifiedDiff(text: string): boolean {
  return UNIFIED_HUNK_HEADER.test(text) || PATCH_ENVELOPE_HEADER.test(text);
}

export function parseUnifiedDiff(text: string): DiffLine[] {
  return text.split('\n').map((line) => {
    if (DIFF_META_PREFIXES.some((prefix) => line.startsWith(prefix))) {
      return { type: 'meta' as const, content: line };
    }
    if (line.startsWith('+')) return { type: 'add' as const, content: line.slice(1) };
    if (line.startsWith('-')) return { type: 'remove' as const, content: line.slice(1) };
    if (line.startsWith(' ')) return { type: 'context' as const, content: line.slice(1) };
    return { type: 'context' as const, content: line };
  });
}

function readString(
  source: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

function filePathFromDiffHeader(text: string): string | undefined {
  const unified = text.match(/^\+\+\+ (?:b\/)?(.+)$/m)?.[1]?.trim();
  if (unified && unified !== '/dev/null') return unified;
  return text.match(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/m)?.[1]?.trim();
}

function buildDiff(lines: DiffLine[], filePath?: string): FileDiff | null {
  const additions = lines.filter((line) => line.type === 'add').length;
  const deletions = lines.filter((line) => line.type === 'remove').length;
  if (additions === 0 && deletions === 0) return null;
  return { filePath, lines, additions, deletions };
}

export function detectFileDiff(parameters?: Record<string, unknown>): FileDiff | null {
  if (!parameters) return null;
  const argPath = readString(parameters, FILE_PATH_KEYS);

  const patch = readString(parameters, ['patch', 'diff', 'unified_diff', 'patchText']);
  if (patch && looksLikeUnifiedDiff(patch)) {
    return buildDiff(parseUnifiedDiff(patch), argPath ?? filePathFromDiffHeader(patch));
  }

  const oldText = readString(parameters, OLD_TEXT_KEYS);
  const newText = readString(parameters, NEW_TEXT_KEYS);
  if (oldText == null && newText == null) return null;

  const lines: DiffLine[] = [
    ...(oldText
      ? oldText.split('\n').map((content) => ({ type: 'remove' as const, content }))
      : []),
    ...(newText ? newText.split('\n').map((content) => ({ type: 'add' as const, content })) : []),
  ];
  return buildDiff(lines, argPath);
}

export function detectResultDiff(
  result?: string,
  parameters?: Record<string, unknown>,
): FileDiff | null {
  if (!result || !looksLikeUnifiedDiff(result)) return null;
  return buildDiff(
    parseUnifiedDiff(result),
    filePathFromDiffHeader(result) ?? readString(parameters, FILE_PATH_KEYS),
  );
}
