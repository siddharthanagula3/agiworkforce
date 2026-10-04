import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const MARKETING_ROOT = resolve(__dirname, '..', '..');
const TABLIST_MARKER = 'role="tablist"';
const KEYBOARD_MARKERS = ['onKeyDown', 'useTablistKeyboard'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return entry === '__tests__' || entry === 'node_modules' ? [] : sourceFiles(path);
    }
    return /\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry) ? [path] : [];
  });
}

describe('marketing tablist keyboard contract', () => {
  const tablistFiles = sourceFiles(MARKETING_ROOT).filter((file) =>
    readFileSync(file, 'utf8').includes(TABLIST_MARKER),
  );

  it('finds the known tablists', () => {
    expect(tablistFiles.length).toBeGreaterThanOrEqual(2);
  });

  it.each(tablistFiles.map((file) => [file.slice(MARKETING_ROOT.length + 1), file]))(
    '%s wires keyboard navigation on its tablist',
    (_name, file) => {
      const source = readFileSync(file as string, 'utf8');
      expect(KEYBOARD_MARKERS.some((marker) => source.includes(marker))).toBe(true);
    },
  );
});
