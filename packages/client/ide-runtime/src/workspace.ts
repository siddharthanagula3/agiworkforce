/**
 * Workspace file semantics every surface has to agree on. The host supplies the
 * bytes and the directory entries; what counts as binary, what a glob means and
 * what a match looks like is decided once, here.
 */

/** Never walked: none of them hold source, and all of them are large. */
export const SKIPPED_WORKSPACE_DIRECTORIES: readonly string[] = [
  '.git',
  'node_modules',
  '.next',
  'dist',
  'build',
  'target',
  '.turbo',
  '.cache',
  'coverage',
];

const SKIPPED = new Set(SKIPPED_WORKSPACE_DIRECTORIES);

export const MAX_WORKSPACE_WALK_DEPTH = 24;
export const BINARY_SNIFF_BYTES = 8192;
export const GREP_PREVIEW_LIMIT = 240;

export function isSkippedDirectory(name: string): boolean {
  return SKIPPED.has(name);
}

/** Workspace paths are POSIX-separated on every platform, so keys compare. */
export function toPosixPath(value: string): string {
  return value.split('\\').join('/');
}

export function joinWorkspacePath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

/**
 * A file counts as binary when a NUL byte appears in its opening bytes, which
 * is how git decides the same question. Reading the whole file to be certain
 * would defeat the point of asking.
 */
export function looksBinary(sample: Uint8Array): boolean {
  const limit = Math.min(sample.length, BINARY_SNIFF_BYTES);
  for (let index = 0; index < limit; index += 1) {
    if (sample[index] === 0) return true;
  }
  return false;
}

/**
 * Translates a glob into a regular expression.
 *
 * Every regex metacharacter is escaped first, so a pattern cannot smuggle regex
 * syntax through; the wildcards are then reintroduced deliberately. The
 * distinction callers depend on is that `**` crosses directory separators and
 * `*` does not.
 */
export function globToRegExp(pattern: string): RegExp {
  let source = '';
  let index = 0;

  while (index < pattern.length) {
    const char = pattern[index];
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        source += '.*';
        index += 2;
        continue;
      }
      source += '[^/]*';
      index += 1;
      continue;
    }
    if (char === '?') {
      source += '[^/]';
      index += 1;
      continue;
    }
    source += (char ?? '').replace(/[.+^${}()|[\]\\]/g, '\\$&');
    index += 1;
  }

  return new RegExp(`^${source}$`);
}

export function matchesGlob(pattern: string, path: string): boolean {
  return globToRegExp(pattern).test(toPosixPath(path));
}

export interface WorkspaceGrepMatch {
  path: string;
  line: number;
  column: number;
  preview: string;
}

export interface GrepOptions {
  limit?: number;
  previewLimit?: number;
}

/** Literal substring search over one file's text, with 1-based coordinates. */
export function grepLines(
  path: string,
  text: string,
  query: string,
  options: GrepOptions = {},
): WorkspaceGrepMatch[] {
  if (query.length === 0) return [];
  const limit = options.limit ?? Number.MAX_SAFE_INTEGER;
  const previewLimit = options.previewLimit ?? GREP_PREVIEW_LIMIT;
  const matches: WorkspaceGrepMatch[] = [];
  const lines = text.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    if (matches.length >= limit) break;
    const line = lines[index] ?? '';
    const column = line.indexOf(query);
    if (column === -1) continue;
    matches.push({
      path: toPosixPath(path),
      line: index + 1,
      column: column + 1,
      preview: line.length > previewLimit ? line.slice(0, previewLimit) : line,
    });
  }
  return matches;
}
