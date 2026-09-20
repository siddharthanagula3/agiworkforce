import { describe, expect, it } from 'vitest';

import { DEFAULT_TEXT_WINDOW, windowText } from '../search/chunk';

const OPTIONS = DEFAULT_TEXT_WINDOW;
const MAX_WINDOW = OPTIONS.windowChars + OPTIONS.boundarySearchChars;

function repeated(unit: string, times: number): string {
  return Array.from({ length: times }, () => unit).join('');
}

/** A corpus covering the shapes real sources take, generated rather than typed. */
const CORPUS: ReadonlyArray<readonly [string, string]> = [
  ['empty', ''],
  ['one word', 'runway'],
  ['one short paragraph', 'The runway is eleven months at the current burn rate.'],
  ['exactly one window', repeated('a', OPTIONS.windowChars)],
  ['one window and one character', repeated('a', OPTIONS.windowChars + 1)],
  ['prose with paragraphs', repeated('Quarterly burn and runway figures.\n\n', 400)],
  ['prose with sentences only', repeated('Burn is flat. Runway is long. Hiring is paused. ', 400)],
  ['no whitespace at all', repeated('0123456789', 3_000)],
  ['one enormous word', repeated('x', 50_000)],
  ['tabs and newlines only', repeated('\t\n', 5_000)],
  ['cjk without spaces', repeated('現金残高と運転資金の見通し', 2_000)],
  ['emoji and combining marks', repeated('á😀 ', 4_000)],
  ['trailing whitespace run', `${repeated('Runway detail. ', 500)}${repeated(' ', 2_000)}`],
];

describe('chunking is deterministic, bounded and traceable', () => {
  it.each(CORPUS)('cuts %s the same way every time', (_name, content) => {
    expect(windowText(content, OPTIONS)).toEqual(windowText(content, OPTIONS));
  });

  it.each(CORPUS)('keeps every window of %s inside the declared bound', (_name, content) => {
    for (const window of windowText(content, OPTIONS)) {
      expect(window.end - window.start).toBeGreaterThan(0);
      expect(window.end - window.start).toBeLessThanOrEqual(MAX_WINDOW);
    }
  });

  it.each(CORPUS)('lets every window of %s be traced back to its own offsets', (_name, content) => {
    for (const window of windowText(content, OPTIONS)) {
      expect(content.slice(window.start, window.end)).toBe(window.text);
      expect(window.start).toBeGreaterThanOrEqual(0);
      expect(window.end).toBeLessThanOrEqual(content.length);
      expect(window.start).toBeLessThan(window.end);
    }
  });

  it.each(CORPUS)(
    'advances through %s rather than cutting the same place twice',
    (_name, content) => {
      const windows = windowText(content, OPTIONS);
      for (let at = 1; at < windows.length; at += 1) {
        expect(windows[at]!.start).toBeGreaterThan(windows[at - 1]!.start);
        expect(windows[at]!.end).toBeGreaterThan(windows[at - 1]!.end);
      }
      const ceiling = Math.ceil(content.length / OPTIONS.minWindowChars) + 1;
      expect(windows.length).toBeLessThanOrEqual(ceiling);
    },
  );

  it.each(CORPUS)('leaves no readable stretch of %s outside every window', (_name, content) => {
    const windows = windowText(content, OPTIONS);
    if (content.trim().length === 0) {
      expect(windows).toEqual([]);
      return;
    }
    expect(windows[0]!.start).toBe(0);
    expect(content.slice(windows[windows.length - 1]!.end).trim()).toBe('');
    for (let at = 1; at < windows.length; at += 1) {
      expect(windows[at]!.start).toBeLessThanOrEqual(windows[at - 1]!.end);
    }
  });

  it('cuts at a paragraph break rather than at the fixed offset when one is near', () => {
    const head = repeated('Runway detail sentence. ', 60);
    const content = `${head}\n\n${repeated('Burn detail sentence. ', 200)}`;
    const [first] = windowText(content, OPTIONS);
    expect(first!.text.endsWith('\n\n')).toBe(true);
    expect(first!.end).not.toBe(OPTIONS.windowChars);
  });

  it('cuts at a sentence end when no paragraph break is within reach', () => {
    const content = repeated('Runway detail sentence. ', 400);
    const [first] = windowText(content, OPTIONS);
    expect(first!.text.trimEnd().endsWith('.')).toBe(true);
  });

  it('carries the overlap forward so a passage split across a cut is still findable', () => {
    const content = repeated('Runway detail sentence. ', 400);
    const windows = windowText(content, OPTIONS);
    expect(windows.length).toBeGreaterThan(1);
    expect(windows[1]!.start).toBeLessThan(windows[0]!.end);
    expect(windows[0]!.end - windows[1]!.start).toBeLessThanOrEqual(OPTIONS.overlapChars);
  });

  it('never emits a window that is only whitespace', () => {
    for (const [, content] of CORPUS) {
      for (const window of windowText(content, OPTIONS)) {
        expect(window.text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('holds the same bounds under every window size a caller could pick', () => {
    const content = repeated('Runway detail sentence. ', 500);
    for (const windowChars of [200, 500, 1_400, 4_000]) {
      const options = { ...OPTIONS, windowChars, minWindowChars: Math.min(200, windowChars) };
      const windows = windowText(content, options);
      expect(windows.length).toBeGreaterThan(0);
      for (const window of windows) {
        expect(window.end - window.start).toBeLessThanOrEqual(
          windowChars + options.boundarySearchChars,
        );
      }
      expect(windows[windows.length - 1]!.end).toBe(content.length);
    }
  });
});
