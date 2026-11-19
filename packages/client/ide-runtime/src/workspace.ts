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

const SLASH = '/'.charCodeAt(0);
const STAR = '*'.charCodeAt(0);
const QUESTION_MARK = '?'.charCodeAt(0);

const ONE_IN_SEGMENT = -1;
const REST_OF_SEGMENT = -2;
const ANY_DEPTH = -3;

function isLineTerminator(unit: number): boolean {
  return unit === 0x0a || unit === 0x0d || unit === 0x2028 || unit === 0x2029;
}

/** Folds one UTF-16 unit the way a regular expression's `i` flag does. */
function foldCase(unit: number): number {
  const upper = String.fromCharCode(unit).toUpperCase();
  if (upper.length !== 1) return unit;
  const folded = upper.charCodeAt(0);
  return unit >= 0x80 && folded < 0x80 ? unit : folded;
}

function parseGlob(pattern: string, ignoreCase: boolean): number[] {
  const tokens: number[] = [];
  let index = 0;

  while (index < pattern.length) {
    const unit = pattern.charCodeAt(index);
    if (unit === STAR) {
      if (pattern.charCodeAt(index + 1) === STAR) {
        if (tokens[tokens.length - 1] !== ANY_DEPTH) tokens.push(ANY_DEPTH);
        index += 2;
        continue;
      }
      tokens.push(REST_OF_SEGMENT);
      index += 1;
      continue;
    }
    if (unit === QUESTION_MARK) {
      tokens.push(ONE_IN_SEGMENT);
      index += 1;
      continue;
    }
    tokens.push(ignoreCase ? foldCase(unit) : unit);
    index += 1;
  }

  return tokens;
}

/**
 * Lists a place in the pattern, and each place a wildcard matching nothing
 * leads on to. Places arrive in rising order, so one already listed brought
 * the places after it along and the list stays sorted without repeats.
 */
function reach(tokens: readonly number[], places: number[], from: number): void {
  if (from <= (places[places.length - 1] ?? -1)) return;
  let place = from;
  places.push(place);
  while (tokens[place] === REST_OF_SEGMENT || tokens[place] === ANY_DEPTH) {
    place += 1;
    places.push(place);
  }
}

function matchGlob(tokens: readonly number[], path: string, ignoreCase: boolean): boolean {
  let places: number[] = [];
  let following: number[] = [];
  reach(tokens, places, 0);

  for (let index = 0; index < path.length && places.length > 0; index += 1) {
    const unit = ignoreCase ? foldCase(path.charCodeAt(index)) : path.charCodeAt(index);
    following.length = 0;
    for (const place of places) {
      const token = tokens[place];
      if (token === ANY_DEPTH) {
        if (!isLineTerminator(unit)) reach(tokens, following, place);
      } else if (token === REST_OF_SEGMENT) {
        if (unit !== SLASH) reach(tokens, following, place);
      } else if (token === ONE_IN_SEGMENT ? unit !== SLASH : token === unit) {
        reach(tokens, following, place + 1);
      }
    }
    [places, following] = [following, places];
  }

  return places[places.length - 1] === tokens.length;
}

/**
 * Compiles a glob into a test for one workspace path.
 *
 * `**` crosses directory separators, `*` and `?` do not, and every other
 * character stands for itself; a path matches only as a whole. `**` stops at a
 * line terminator.
 *
 * The pattern is whatever the caller was handed, so it is never given to the
 * regular expression engine: that engine backtracks, and a run of wildcards
 * against a path that almost matches costs it the path's length raised to the
 * number of wildcards. This walks the path once, carrying every place in the
 * pattern the text so far could have reached, which bounds the work by the
 * path's length times the pattern's.
 */
export function compileGlob(
  pattern: string,
  options: { ignoreCase?: boolean } = {},
): (path: string) => boolean {
  const ignoreCase = options.ignoreCase === true;
  const tokens = parseGlob(pattern, ignoreCase);
  return (path) => matchGlob(tokens, path, ignoreCase);
}

export function matchesGlob(pattern: string, path: string): boolean {
  return compileGlob(pattern)(toPosixPath(path));
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
