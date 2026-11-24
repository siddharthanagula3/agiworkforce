const FILE_HEADER = 'diff --git ';
const NEW_PATH_PREFIX = '+++ b/';
const OLD_PATH_PREFIX = '--- a/';
const HEADER_NEW_MARKER = ' b/';
const DEV_NULL = '/dev/null';
const HUNK_MARKER = '@@';
const INDEX_MARKER = 'index ';
const ADDED_MARKER = '+';
const REMOVED_MARKER = '-';
const FIRST_LINE = 0;

export type CodeDiffLineKind = 'added' | 'removed' | 'meta' | 'context';

export interface CodeDiffFile {
  path: string;
  body: string;
}

function headerPath(header: string): string {
  const marker = header.lastIndexOf(HEADER_NEW_MARKER);
  return marker < FIRST_LINE ? '' : header.slice(marker + HEADER_NEW_MARKER.length).trim();
}

function pathFromPrefix(lines: string[], prefix: string): string | null {
  const line = lines.find((candidate) => candidate.startsWith(prefix));
  if (!line) return null;
  const value = line.slice(prefix.length).trim();
  return value === DEV_NULL ? null : value;
}

function sectionPath(lines: string[]): string {
  return (
    pathFromPrefix(lines, NEW_PATH_PREFIX) ??
    pathFromPrefix(lines, OLD_PATH_PREFIX) ??
    headerPath(lines[FIRST_LINE] ?? '')
  );
}

export function parseUnifiedDiff(diff: string): CodeDiffFile[] {
  const sections: string[][] = [];
  let current: string[] | null = null;

  for (const line of diff.split('\n')) {
    if (line.startsWith(FILE_HEADER)) {
      current = [];
      sections.push(current);
    }
    current?.push(line);
  }

  return sections
    .map((lines) => ({ path: sectionPath(lines), body: lines.join('\n') }))
    .filter((file) => file.path.length > 0);
}

export function diffByPath(diff: string): Map<string, string> {
  return new Map(parseUnifiedDiff(diff).map((file) => [file.path, file.body]));
}

export function turnDiffByPath(diff: string, paths: readonly string[]): Map<string, string> {
  const gitDiffs = diffByPath(diff);
  if (gitDiffs.size > 0) return gitDiffs;

  const files = new Map<string, string[]>();
  const lines = diff.split('\n');
  let nextPath = 0;
  let section: string[] | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const path = paths[nextPath];
    if (
      path &&
      line === `${OLD_PATH_PREFIX}${path}` &&
      lines[index + 1] === `${NEW_PATH_PREFIX}${path}`
    ) {
      section = files.get(path) ?? [];
      files.set(path, section);
      nextPath += 1;
      index += 1;
      continue;
    }
    section?.push(line);
  }
  return new Map([...files].map(([path, lines]) => [path, lines.join('\n')]));
}

export function diffLineKind(line: string): CodeDiffLineKind {
  if (
    line.startsWith(FILE_HEADER) ||
    line.startsWith(NEW_PATH_PREFIX) ||
    line.startsWith(OLD_PATH_PREFIX) ||
    line.startsWith(INDEX_MARKER) ||
    line.startsWith(HUNK_MARKER)
  ) {
    return 'meta';
  }
  if (line.startsWith(ADDED_MARKER)) return 'added';
  if (line.startsWith(REMOVED_MARKER)) return 'removed';
  return 'context';
}

export function diffLineCounts(body: string): { added: number; removed: number } | null {
  let hunk = false;
  let added = 0;
  let removed = 0;
  for (const line of body.split('\n')) {
    if (line.startsWith(HUNK_MARKER)) hunk = true;
    else if (hunk && line.startsWith(ADDED_MARKER)) added += 1;
    else if (hunk && line.startsWith(REMOVED_MARKER)) removed += 1;
  }
  return added || removed ? { added, removed } : null;
}
