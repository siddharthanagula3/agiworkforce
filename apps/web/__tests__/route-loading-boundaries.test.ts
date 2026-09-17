import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_DIR = path.join(__dirname, '..', 'app');

/**
 * A segment that renders on the server, or that gates on the signed-in session
 * before it can show anything, suspends on navigation. Without a boundary the
 * reader is held on the previous page with no sign that anything is happening.
 * A purely static marketing page never suspends, so it is not in scope.
 */
function suspendsOnNavigation(pagePath: string): boolean {
  const source = readFileSync(pagePath, 'utf8');
  return (
    /export const dynamic\b/.test(source) ||
    /export default async function/.test(source) ||
    /\bawait auth\(/.test(source) ||
    /\bcurrentUser\(/.test(source) ||
    /getUserScopedDb/.test(source)
  );
}

function topLevelSegments(): string[] {
  return readdirSync(APP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_') && entry.name !== 'api')
    .map((entry) => entry.name);
}

describe('route loading boundaries', () => {
  it('gives every segment that suspends on navigation a loading boundary', () => {
    const missing = topLevelSegments().filter((segment) => {
      const page = path.join(APP_DIR, segment, 'page.tsx');
      if (!existsSync(page)) return false;
      if (!suspendsOnNavigation(page)) return false;
      return !existsSync(path.join(APP_DIR, segment, 'loading.tsx'));
    });

    expect(missing).toEqual([]);
  });

  it('routes the shared boundary through the Spinner primitive, not a bare spinning div', () => {
    const shared = readFileSync(
      path.join(__dirname, '..', 'shared', 'components', 'RouteLoading.tsx'),
      'utf8',
    );
    expect(shared).toContain("from '@agiworkforce/ui'");
    expect(shared).toContain('Spinner');
    expect(shared).not.toContain('animate-spin');
    expect(shared).toContain('aria-live="polite"');
  });
});
