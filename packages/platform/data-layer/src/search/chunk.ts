import type { TextWindow } from './types';

export interface WindowOptions {
  windowChars: number;
  overlapChars: number;
  minWindowChars: number;
  boundarySearchChars: number;
}

export const DEFAULT_TEXT_WINDOW: WindowOptions = Object.freeze({
  windowChars: 1_400,
  overlapChars: 200,
  minWindowChars: 200,
  boundarySearchChars: 300,
});

function findBoundary(text: string, from: number, searchChars: number): number {
  const window = text.slice(from, Math.min(text.length, from + searchChars));
  const paragraph = window.indexOf('\n\n');
  if (paragraph >= 0) return from + paragraph + 2;
  const sentence = window.search(/[.!?]\s/);
  if (sentence >= 0) return from + sentence + 2;
  const space = window.indexOf(' ');
  if (space >= 0) return from + space + 1;
  return from;
}

/**
 * Cuts text into overlapping windows that prefer paragraph and sentence breaks,
 * carrying each window's character offsets so a retrieved passage can be traced
 * back to where it sits in the source.
 */
export function windowText(content: string, options: WindowOptions): TextWindow[] {
  const windows: TextWindow[] = [];
  let cursor = 0;
  while (cursor < content.length) {
    const target = cursor + options.windowChars;
    const end =
      target >= content.length
        ? content.length
        : findBoundary(content, target, options.boundarySearchChars);
    const text = content.slice(cursor, end);
    if (text.trim()) windows.push({ start: cursor, end, text });
    if (end >= content.length) break;
    cursor = Math.max(end - options.overlapChars, cursor + options.minWindowChars);
  }
  return windows;
}
