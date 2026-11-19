import { existsSync, globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

const webRoot = resolve(import.meta.dirname, '../..');
const routeLoading = readFileSync(resolve(webRoot, 'shared/components/RouteLoading.tsx'), 'utf8');
const spinner = readFileSync(
  resolve(webRoot, '../../packages/ui/ui/src/primitives/Spinner.tsx'),
  'utf8',
);
const markStyles = readFileSync(
  resolve(webRoot, '../../packages/ui/design-tokens/src/foundation.css'),
  'utf8',
);

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
  const boundaries = loadingFiles();

  it('finds loading screens and routes each through the shared primitive', () => {
    expect(boundaries.length).toBeGreaterThan(0);
    expect(
      boundaries
        .filter((file) => !readFileSync(file, 'utf8').includes('<RouteLoading '))
        .map(shortName),
    ).toEqual([]);
  });

  it('every spinner exposes a live region and a label', () => {
    expect(routeLoading).toContain('role="status"');
    expect(routeLoading).toContain('aria-label={label}');
    expect(spinner).toContain('sr-only');
  });

  it('every spinner honours reduced motion', () => {
    expect(spinner).toContain('<AgiMark spinning');
    const reducedMotion = markStyles.slice(
      markStyles.indexOf('@media (prefers-reduced-motion: reduce)'),
    );
    expect(reducedMotion).toMatch(/\.agi-mark-ribbon\s*\{\s*display: none;/u);
    expect(reducedMotion).toMatch(/\.agi-mark-shine\s*\{\s*animation: none;/u);
  });

  it('no spinner pins a colour outside the theme', () => {
    expect(routeLoading).not.toMatch(/border-(?:zinc|blue)-/u);
    expect(spinner).not.toMatch(/border-(?:zinc|blue)-|#[0-9a-f]{3,8}\b|rgb\(/iu);
    expect(markStyles).toContain('fill: var(--symbol-ribbon-shine);');
  });
});
