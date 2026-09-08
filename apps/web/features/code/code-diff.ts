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
