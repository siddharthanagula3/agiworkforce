import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A route in the sitemap that exports no metadata inherits the app-wide default
 * title, so it appears in search results and browser tabs as the generic
 * "AGI | One AI workspace…". A client component cannot export metadata, so the
 * route needs a layout that does.
 */

const APP_DIR = join(__dirname, '..');

function routeDeclaresMetadata(route: string): boolean {
  const dir = join(APP_DIR, route);
  for (const file of ['layout.tsx', 'page.tsx']) {
    const path = join(dir, file);
    if (!existsSync(path)) continue;
    if (/export const metadata|export function generateMetadata/.test(readFileSync(path, 'utf8'))) {
      return true;
    }
  }
  return false;
}

describe('sitemap-indexed client routes carry their own title', () => {
  it.each(['skills', 'connectors', 'apps'])('/%s declares metadata', (route) => {
    expect(routeDeclaresMetadata(route)).toBe(true);
  });

  it('names something more specific than the app default', () => {
    for (const route of ['skills', 'connectors', 'apps']) {
      const layout = readFileSync(join(APP_DIR, route, 'layout.tsx'), 'utf8');
      expect(layout).toContain(`path: '/${route}'`);
      expect(layout).not.toContain('One AI workspace across models and tools');
    }
  });
});

describe('redirect aliases do not carry parameters nothing reads', () => {
  it('/ai-skills sends visitors to /skills with no dead query string', () => {
    const source = readFileSync(join(APP_DIR, 'ai-skills', 'page.tsx'), 'utf8');
    expect(source).toContain("redirect('/skills')");
    expect(source).not.toContain('tab=agents');
  });
});
