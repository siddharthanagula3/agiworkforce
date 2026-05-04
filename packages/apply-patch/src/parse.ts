/**
 * Patch parser — turns the OpenClaw `*** Begin Patch / *** End Patch` markup
 * into typed `Hunk` objects. Adapted from the parser inside OpenClaw
 * `src/agents/apply-patch.ts` (MIT, Peter Steinberger).
 *
 * Markers:
 *   *** Begin Patch
 *   *** Add File: <path>
 *   +<line>
 *   *** Delete File: <path>
 *   *** Update File: <path>
 *   *** Move to: <newPath>
 *   @@ <optional context line> @@
 *   @@
 *   -<old line>
 *   +<new line>
 *    (space-prefixed) <context line>
 *   *** End of File
 *   *** End Patch
 */

import type { Hunk, UpdateFileChunk, UpdateFileHunk } from './types';

const BEGIN_PATCH_MARKER = '*** Begin Patch';
const END_PATCH_MARKER = '*** End Patch';
const ADD_FILE_MARKER = '*** Add File: ';
const DELETE_FILE_MARKER = '*** Delete File: ';
const UPDATE_FILE_MARKER = '*** Update File: ';
const MOVE_TO_MARKER = '*** Move to: ';
const EOF_MARKER = '*** End of File';
const CHANGE_CONTEXT_MARKER = '@@ ';
const EMPTY_CHANGE_CONTEXT_MARKER = '@@';

export function parsePatch(input: string): Hunk[] {
  const lines = input.split('\n');
  let i = findBeginIndex(lines);
  if (i < 0) {
    throw new Error(`Patch is missing the "${BEGIN_PATCH_MARKER}" marker`);
  }
  i += 1;

  const hunks: Hunk[] = [];
  while (i < lines.length) {
    const raw = lines[i];
    if (raw === undefined) break;
    const line = raw;
    if (line.startsWith(END_PATCH_MARKER)) {
      return hunks;
    }
    if (line.startsWith(ADD_FILE_MARKER)) {
      const path = line.slice(ADD_FILE_MARKER.length).trim();
      const { contents, next } = readAddBody(lines, i + 1);
      hunks.push({ kind: 'add', path, contents });
      i = next;
      continue;
    }
    if (line.startsWith(DELETE_FILE_MARKER)) {
      const path = line.slice(DELETE_FILE_MARKER.length).trim();
      hunks.push({ kind: 'delete', path });
      i += 1;
      continue;
    }
    if (line.startsWith(UPDATE_FILE_MARKER)) {
      const path = line.slice(UPDATE_FILE_MARKER.length).trim();
      const { hunk, next } = readUpdateBody(lines, i + 1, path);
      hunks.push(hunk);
      i = next;
      continue;
    }
    // Skip unrecognized line — defensive against trailing whitespace etc.
    i += 1;
  }

  throw new Error(`Patch is missing the "${END_PATCH_MARKER}" marker`);
}

function findBeginIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? '').trimEnd() === BEGIN_PATCH_MARKER) return i;
  }
  return -1;
}

function readAddBody(lines: string[], start: number): { contents: string; next: number } {
  const out: string[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) break;
    if (
      line.startsWith(END_PATCH_MARKER) ||
      line.startsWith(ADD_FILE_MARKER) ||
      line.startsWith(DELETE_FILE_MARKER) ||
      line.startsWith(UPDATE_FILE_MARKER)
    ) {
      break;
    }
    if (line.startsWith('+')) {
      out.push(line.slice(1));
    } else if (line === '') {
      out.push('');
    } else {
      // Unprefixed lines inside an Add block are tolerated (some authors
      // forget the `+`); preserve verbatim.
      out.push(line);
    }
    i += 1;
  }
  return { contents: out.join('\n'), next: i };
}

function readUpdateBody(
  lines: string[],
  start: number,
  path: string,
): { hunk: UpdateFileHunk; next: number } {
  let i = start;
  let movePath: string | undefined;
  if (i < lines.length && (lines[i] ?? '').startsWith(MOVE_TO_MARKER)) {
    movePath = (lines[i] ?? '').slice(MOVE_TO_MARKER.length).trim();
    i += 1;
  }

  const chunks: UpdateFileChunk[] = [];
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) break;
    if (
      line.startsWith(END_PATCH_MARKER) ||
      line.startsWith(ADD_FILE_MARKER) ||
      line.startsWith(DELETE_FILE_MARKER) ||
      line.startsWith(UPDATE_FILE_MARKER)
    ) {
      break;
    }

    let changeContext: string | undefined;
    if (line.startsWith(CHANGE_CONTEXT_MARKER)) {
      changeContext = line
        .slice(CHANGE_CONTEXT_MARKER.length)
        .replace(/\s*@@\s*$/, '')
        .trim();
      i += 1;
    } else if (line.trimEnd() === EMPTY_CHANGE_CONTEXT_MARKER) {
      i += 1;
    }

    const oldLines: string[] = [];
    const newLines: string[] = [];
    let isEndOfFile = false;

    while (i < lines.length) {
      const inner = lines[i];
      if (inner === undefined) break;
      if (
        inner.startsWith(END_PATCH_MARKER) ||
        inner.startsWith(ADD_FILE_MARKER) ||
        inner.startsWith(DELETE_FILE_MARKER) ||
        inner.startsWith(UPDATE_FILE_MARKER) ||
        inner.startsWith(CHANGE_CONTEXT_MARKER) ||
        inner.trimEnd() === EMPTY_CHANGE_CONTEXT_MARKER
      ) {
        break;
      }
      if (inner.startsWith(EOF_MARKER)) {
        isEndOfFile = true;
        i += 1;
        break;
      }
      if (inner.startsWith('-')) {
        oldLines.push(inner.slice(1));
      } else if (inner.startsWith('+')) {
        newLines.push(inner.slice(1));
      } else if (inner.startsWith(' ')) {
        oldLines.push(inner.slice(1));
        newLines.push(inner.slice(1));
      } else if (inner === '') {
        oldLines.push('');
        newLines.push('');
      } else {
        // Unrecognized; treat as context.
        oldLines.push(inner);
        newLines.push(inner);
      }
      i += 1;
    }

    if (oldLines.length === 0 && newLines.length === 0 && changeContext === undefined) {
      // Empty chunk separator; advance.
      continue;
    }
    chunks.push({
      ...(changeContext !== undefined ? { changeContext } : {}),
      oldLines,
      newLines,
      isEndOfFile,
    });
  }

  const hunk: UpdateFileHunk = {
    kind: 'update',
    path,
    chunks,
    ...(movePath !== undefined ? { movePath } : {}),
  };
  return { hunk, next: i };
}
