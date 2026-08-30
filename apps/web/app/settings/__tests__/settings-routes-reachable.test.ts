import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../../../..');
const webRoot = resolve(repoRoot, 'apps/web');

/**
 * `/settings/byok` and `/settings/sync` were complete, working settings pages
 * with no rail entry and no inbound link from anywhere: only a typed or
 * bookmarked URL reached them. A settings page a user cannot navigate to is
 * indistinguishable from one that does not exist.
 */
function settingsRoutes(): string[] {
  const dir = resolve(webRoot, 'app/settings');
  return (
    readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
      // `[section]` is a dynamic segment, not a route a user can be sent to.
      .filter((entry) => !entry.name.startsWith('['))
      .filter((entry) => existsSync(resolve(dir, entry.name, 'page.tsx')))
      // A redirect-only page is a legacy-URL alias. Nothing should link to it -
      // it exists so an old bookmark still lands somewhere sensible.
      .filter((entry) => {
        const source = readFileSync(resolve(dir, entry.name, 'page.tsx'), 'utf8');
        return !/\bredirect\(/.test(source);
      })
      .map((entry) => entry.name)
  );
}

function sourceFiles(): string[] {
  return execFileSync('git', ['ls-files', 'apps/web/**/*.tsx', 'packages/ui/**/*.tsx'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    .filter((file) => !file.includes('__tests__') && !file.endsWith('.test.tsx'))
    .filter((file) => existsSync(resolve(repoRoot, file)));
}

describe('every settings page is reachable from the product', () => {
  const files = sourceFiles().map((file) => readFileSync(resolve(repoRoot, file), 'utf8'));
  const navKeys = readFileSync(resolve(repoRoot, 'packages/ui/ui/src/settings-nav.ts'), 'utf8');
  const routes = settingsRoutes();

  it('finds settings routes to check', () => {
    expect(routes.length).toBeGreaterThan(3);
  });

  for (const route of routes) {
    it(`/settings/${route} has a rail entry or an inbound link`, () => {
      const inNav = new RegExp(`key: '${route}'`).test(navKeys);
      const linkedByUrl = files.some(
        (source) =>
          source.includes(`/settings/${route}"`) || source.includes(`/settings/${route}'`),
      );
      // Several settings pages are reached as modal sections rather than by
      // URL, through <SettingsSectionLink section="...">.
      const linkedAsSection = files.some(
        (source) =>
          source.includes(`section="${route}"`) || source.includes(`section={'${route}'}`),
      );
      expect(
        inNav || linkedByUrl || linkedAsSection,
        `/settings/${route} renders a page but nothing navigates to it`,
      ).toBe(true);
    });
  }
});
