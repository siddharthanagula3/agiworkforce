import { existsSync, globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

const webRoot = resolve(import.meta.dirname, '../..');

/**
 * Route-level loading screens rendered a bare spinning div: no role, no label,
 * no live region. A screen-reader user navigating to those pages heard nothing
 * at all while they loaded. Five of them also pinned `border-zinc-700
 * border-t-blue-500`, which ignores both the theme and the user's accent.
 */
function loadingFiles(): string[] {
  return globSync('app/**/loading.tsx', { cwd: webRoot })
    .map((relative) => resolve(webRoot, relative))
    .filter((file) => existsSync(file));
}

const shortName = (file: string): string => file.slice(file.indexOf('app/'));

describe('route loading screens announce themselves', () => {
  const spinners = loadingFiles().filter((file) =>
    readFileSync(file, 'utf8').includes('animate-spin'),
  );

  it('finds loading screens with spinners to check', () => {
    expect(spinners.length).toBeGreaterThan(10);
  });

  it('every spinner exposes a live region and a label', () => {
    const silent = spinners.filter((file) => {
      const source = readFileSync(file, 'utf8');
      if (!source.includes('role="status"')) return true;
      // Either a visually hidden label or visible text inside the region will
      // do — the root screen shows "Loading…" on screen, which is not worse.
      return !source.includes('sr-only') && !/>\s*Loading/.test(source);
    });
    expect(silent.map(shortName)).toEqual([]);
  });

  it('every spinner honours reduced motion', () => {
    const spinning = spinners.filter(
      (file) => !readFileSync(file, 'utf8').includes('motion-reduce:animate-none'),
    );
    expect(spinning.map(shortName)).toEqual([]);
  });

  it('no spinner pins a colour outside the theme', () => {
    const pinned = spinners.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return source.includes('border-zinc-700') || source.includes('border-t-blue-500');
    });
    expect(pinned.map(shortName)).toEqual([]);
  });
});
