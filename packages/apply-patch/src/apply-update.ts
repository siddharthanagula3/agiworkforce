/**
 * Update-file hunk applicator.
 *
 * Lifted from OpenClaw `src/agents/apply-patch-update.ts` (MIT, Peter Steinberger).
 * See THIRD_PARTY_LICENSES.md at repo root.
 *
 * Adaptation: takes a UTF-8 string contents directly instead of reading via
 * a bridge — that means the caller must read first. This keeps the matcher
 * pure and easy to unit-test.
 */

import type { UpdateFileChunk } from './types';

export function applyUpdateHunkToContents(
  filePath: string,
  originalContents: string,
  chunks: UpdateFileChunk[],
): string {
  const originalLines = originalContents.split('\n');
  if (originalLines.length > 0 && originalLines[originalLines.length - 1] === '') {
    originalLines.pop();
  }

  const replacements = computeReplacements(originalLines, filePath, chunks);
  let newLines = applyReplacements(originalLines, replacements);
  if (newLines.length === 0 || newLines[newLines.length - 1] !== '') {
    newLines = [...newLines, ''];
  }
  return newLines.join('\n');
}

function computeReplacements(
  originalLines: string[],
  filePath: string,
  chunks: UpdateFileChunk[],
): Array<[number, number, string[]]> {
  const replacements: Array<[number, number, string[]]> = [];
  let lineIndex = 0;

  for (const chunk of chunks) {
    if (chunk.changeContext) {
      const ctxIndex = seekSequence(originalLines, [chunk.changeContext], lineIndex, false);
      if (ctxIndex === null) {
        throw new Error(`Failed to find context '${chunk.changeContext}' in ${filePath}`);
      }
      lineIndex = ctxIndex + 1;
    }

    if (chunk.oldLines.length === 0) {
      const insertionIndex =
        originalLines.length > 0 && originalLines[originalLines.length - 1] === ''
          ? originalLines.length - 1
          : originalLines.length;
      replacements.push([insertionIndex, 0, chunk.newLines]);
      continue;
    }

    let pattern = chunk.oldLines;
    let newSlice = chunk.newLines;
    let found = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile);

    if (found === null && pattern[pattern.length - 1] === '') {
      pattern = pattern.slice(0, -1);
      if (newSlice.length > 0 && newSlice[newSlice.length - 1] === '') {
        newSlice = newSlice.slice(0, -1);
      }
      found = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile);
    }

    if (found === null) {
      throw new Error(
        `Failed to find expected lines in ${filePath}:\n${chunk.oldLines.join('\n')}`,
      );
    }

    replacements.push([found, pattern.length, newSlice]);
    lineIndex = found + pattern.length;
  }

  replacements.sort((a, b) => a[0] - b[0]);
  return replacements;
}

function applyReplacements(
  lines: string[],
  replacements: Array<[number, number, string[]]>,
): string[] {
  const result = [...lines];
  // Apply from the end so earlier-index replacements aren't shifted by later
  // splices. `[...arr].reverse()` instead of `toReversed()` for ES2022 compat.
  const reversed = [...replacements].reverse();
  for (const [startIndex, oldLen, newLines] of reversed) {
    for (let i = 0; i < oldLen; i += 1) {
      if (startIndex < result.length) {
        result.splice(startIndex, 1);
      }
    }
    for (let i = 0; i < newLines.length; i += 1) {
      const value = newLines[i];
      if (value === undefined) continue;
      result.splice(startIndex + i, 0, value);
    }
  }
  return result;
}

function seekSequence(
  lines: string[],
  pattern: string[],
  start: number,
  eof: boolean,
): number | null {
  if (pattern.length === 0) {
    return start;
  }
  if (pattern.length > lines.length) {
    return null;
  }

  const maxStart = lines.length - pattern.length;
  const searchStart = eof && lines.length >= pattern.length ? maxStart : start;
  if (searchStart > maxStart) {
    return null;
  }

  // Try increasingly relaxed match strategies: exact → trimEnd → trim →
  // unicode-punctuation-normalized.
  for (let i = searchStart; i <= maxStart; i += 1) {
    if (linesMatch(lines, pattern, i, (value) => value)) return i;
  }
  for (let i = searchStart; i <= maxStart; i += 1) {
    if (linesMatch(lines, pattern, i, (value) => value.trimEnd())) return i;
  }
  for (let i = searchStart; i <= maxStart; i += 1) {
    if (linesMatch(lines, pattern, i, (value) => value.trim())) return i;
  }
  for (let i = searchStart; i <= maxStart; i += 1) {
    if (linesMatch(lines, pattern, i, (value) => normalizePunctuation(value.trim()))) return i;
  }

  return null;
}

function linesMatch(
  lines: string[],
  pattern: string[],
  start: number,
  normalize: (value: string) => string,
): boolean {
  for (let idx = 0; idx < pattern.length; idx += 1) {
    const lhs = lines[start + idx];
    const rhs = pattern[idx];
    if (lhs === undefined || rhs === undefined) return false;
    if (normalize(lhs) !== normalize(rhs)) return false;
  }
  return true;
}

function normalizePunctuation(value: string): string {
  return Array.from(value)
    .map((char) => {
      switch (char) {
        case '‐':
        case '‑':
        case '‒':
        case '–':
        case '—':
        case '―':
        case '−':
          return '-';
        case '‘':
        case '’':
        case '‚':
        case '‛':
          return "'";
        case '“':
        case '”':
        case '„':
        case '‟':
          return '"';
        case ' ':
        case ' ':
        case ' ':
        case ' ':
        case ' ':
        case ' ':
        case ' ':
        case ' ':
        case ' ':
        case ' ':
        case ' ':
        case ' ':
        case '　':
          return ' ';
        default:
          return char;
      }
    })
    .join('');
}
