export interface PathReference {
  path: string;
  line?: number;
  column?: number;
  start: number;
  length: number;
}

const DRIVE_OR_ROOT = String.raw`(?:[A-Za-z]:[\\/]|[\\/])?`;
const SEGMENT = String.raw`[\w.\-+@$%~]+`;
const EXTENSION = String.raw`\.[A-Za-z][\w]{0,9}`;
const PATH_PATTERN = new RegExp(
  `${DRIVE_OR_ROOT}(?:${SEGMENT}[\\\\/])*${SEGMENT}${EXTENSION}`,
  'gu',
);

const URL_PATTERN = /[a-z][a-z0-9+.-]*:\/\/\S+/giu;
const SEPARATOR = /[\\/]/u;
const LOWERCASE_EXTENSION = /^[a-z0-9]+$/u;
const MAX_PATH_LENGTH = 1024;
const MAX_POSITION = 1_000_000;

interface PositionSuffix {
  line: number;
  column?: number;
  length: number;
}

const SUFFIX_PATTERNS: readonly RegExp[] = [
  /^:(\d+):(\d+)/u,
  /^\((\d+),(\d+)\)/u,
  /^:line\s+(\d+)/iu,
  /^"?,\s*line\s+(\d+)/iu,
  /^:(\d+)/u,
  /^\((\d+)\)/u,
];

function inRange(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= MAX_POSITION;
}

function readPositionSuffix(text: string): PositionSuffix | undefined {
  for (const pattern of SUFFIX_PATTERNS) {
    const match = pattern.exec(text);
    if (match === null) continue;
    const line = Number(match[1]);
    if (!inRange(line)) continue;
    const rawColumn = match[2];
    if (rawColumn === undefined) return { line, length: match[0].length };
    const column = Number(rawColumn);
    if (!inRange(column)) return { line, length: match[0].length };
    return { line, column, length: match[0].length };
  }
  return undefined;
}

/**
 * A token with no separator and no position suffix is only a file if it reads
 * like one: exactly one dot and a lowercase extension. Without this, a dotted
 * identifier in a stack frame (`com.example.Main.run`, `App.Run`) is indexed
 * as a path and the real frame beside it is the second, not the first, match.
 */
function isSelfEvidentFile(path: string): boolean {
  if (SEPARATOR.test(path)) return true;
  const dotIndex = path.indexOf('.');
  if (dotIndex !== path.lastIndexOf('.')) return false;
  const extension = path.slice(dotIndex + 1);
  return extension.length >= 2 && LOWERCASE_EXTENSION.test(extension);
}

function urlSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  URL_PATTERN.lastIndex = 0;
  let match = URL_PATTERN.exec(text);
  while (match !== null) {
    spans.push([match.index, match.index + match[0].length]);
    match = URL_PATTERN.exec(text);
  }
  return spans;
}

/**
 * Locate file references inside one line of terminal output, one document, or
 * one rendered chat message. Covers workspace-relative and absolute POSIX
 * paths, Windows drive paths, and the position suffixes the common stack
 * traces use: `path:line:col`, `path(line,col)`, `path:line 42` and
 * `File "path", line 42`.
 */
export function findPathReferences(text: string, limit = 200): PathReference[] {
  const references: PathReference[] = [];
  const skipSpans = urlSpans(text);
  PATH_PATTERN.lastIndex = 0;
  let match = PATH_PATTERN.exec(text);
  while (match !== null && references.length < limit) {
    const path = match[0];
    const start = match.index;
    const previous = start === 0 ? '' : text.charAt(start - 1);
    const inUrl = skipSpans.some(([from, to]) => start >= from && start < to);
    if (!inUrl && previous !== ':' && path.length <= MAX_PATH_LENGTH) {
      const suffix = readPositionSuffix(text.slice(start + path.length));
      if (suffix !== undefined || isSelfEvidentFile(path)) {
        references.push({
          path,
          ...(suffix === undefined ? {} : { line: suffix.line }),
          ...(suffix?.column === undefined ? {} : { column: suffix.column }),
          start,
          length: path.length + (suffix?.length ?? 0),
        });
      }
    }
    PATH_PATTERN.lastIndex = start + Math.max(1, path.length);
    match = PATH_PATTERN.exec(text);
  }
  return references;
}

export function describePathReference(reference: PathReference): string {
  if (reference.line === undefined) return reference.path;
  if (reference.column === undefined) return `${reference.path}:${reference.line}`;
  return `${reference.path}:${reference.line}:${reference.column}`;
}
