/**
 * about-links.test.ts
 *
 * About shipped a "Open Source Licenses" row pointing at
 * https://agiworkforce.com/licenses — a URL with no route behind it, so the row
 * backgrounded the app to show a 404. Attribution now lives in-app.
 *
 * This test is the contract that keeps every About destination real: each web
 * URL the screen hardcodes must resolve to a page under apps/web/app (or a
 * redirect declared in next.config), and each in-app push target must resolve
 * to a route file.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isAllowedExternalUrl } from '@/lib/safeOpenURL';

const mobileRoot = join(__dirname, '..');
const aboutSource = readFileSync(join(mobileRoot, 'app', '(app)', 'about.tsx'), 'utf8');
const webAppRoot = join(mobileRoot, '..', 'web', 'app');
const nextConfig = readFileSync(join(mobileRoot, '..', 'web', 'next.config.ts'), 'utf8');

/** Every route with a page, with (group) segments removed. */
function collectWebRoutes(dir: string, segments: string[] = [], routes = new Set<string>()) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && /^page\.(tsx|ts|jsx|js|mdx)$/.test(entry.name)) {
      routes.add(`/${segments.join('/')}`.replace(/\/+$/, '') || '/');
      continue;
    }
    if (!entry.isDirectory()) continue;
    if (entry.name === 'api' || entry.name === '__tests__' || entry.name.startsWith('_')) continue;
    const isGroup = entry.name.startsWith('(') && entry.name.endsWith(')');
    collectWebRoutes(join(dir, entry.name), isGroup ? segments : [...segments, entry.name], routes);
  }
  return routes;
}

function collectRedirectSources(source: string): Set<string> {
  return new Set(Array.from(source.matchAll(/source:\s*'([^']+)'/g), (match) => match[1] ?? ''));
}

const webRoutes = collectWebRoutes(webAppRoot);
const redirectSources = collectRedirectSources(nextConfig);

const webUrls = Array.from(
  new Set(Array.from(aboutSource.matchAll(/'(https:\/\/[^']+)'/g), (match) => match[1] ?? '')),
);
const inAppTargets = Array.from(
  new Set(
    Array.from(aboutSource.matchAll(/router\.push\(\s*'(\/\(app\)\/[^']+)'/g), (m) => m[1] ?? ''),
  ),
);

describe('About screen destinations', () => {
  it('hardcodes at least the site, privacy, and terms URLs', () => {
    expect(webUrls).toEqual(
      expect.arrayContaining([
        'https://agiworkforce.com',
        'https://agiworkforce.com/privacy',
        'https://agiworkforce.com/terms',
      ]),
    );
  });

  it.each(webUrls)('%s resolves to a real page under apps/web/app', (url) => {
    const path = new URL(url).pathname.replace(/\/+$/, '') || '/';
    expect({ url, path, resolved: webRoutes.has(path) || redirectSources.has(path) }).toMatchObject(
      {
        resolved: true,
      },
    );
  });

  it.each(webUrls)('%s is inside the external-URL allowlist', (url) => {
    expect(isAllowedExternalUrl(url)).toBe(true);
  });

  it('no longer points at the licenses URL that never existed', () => {
    expect(webRoutes.has('/licenses')).toBe(false);
    expect(redirectSources.has('/licenses')).toBe(false);
    expect(aboutSource).not.toContain('agiworkforce.com/licenses');
  });

  it('opens the licenses notice in-app, at a route that exists', () => {
    expect(inAppTargets).toContain('/(app)/legal/licenses');

    for (const target of inAppTargets) {
      const relative = target.replace(/^\//, '');
      const candidates = [
        join(mobileRoot, 'app', `${relative}.tsx`),
        join(mobileRoot, 'app', relative, 'index.tsx'),
      ];
      expect({ target, exists: candidates.some((file) => existsSync(file)) }).toMatchObject({
        exists: true,
      });
    }
  });
});
