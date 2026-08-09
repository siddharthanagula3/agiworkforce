import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CONNECTOR_OAUTH_CALLBACK_PATH,
  CONNECTOR_OAUTH_START_PATH,
} from '@agiworkforce/cloud-contracts';
import { CONNECTOR_OAUTH_START_PATH as SHARED_UI_START_PATH } from '@agiworkforce/unified-chat';

/**
 * The per-user connector OAuth broker has exactly two addresses, declared once
 * in `@agiworkforce/cloud-contracts` and used by three surfaces. Nothing in a
 * build catches a drifted copy, and each surface fails differently:
 *
 *   - Web links the user at the start path from `buildConnectorOAuthStartPath`;
 *     a stale copy sends them to a 404 instead of the provider.
 *   - Mobile appends `&mode=json` to the same path to fetch the authorize URL;
 *     a stale copy makes "Connect" fail with a parse error.
 *   - The shared chat UI ACCEPTS a Connect card only when the server's
 *     `connectUrl` is exactly the start path, so a stale copy there silently
 *     rejects genuine cards — the button simply disappears. That package has no
 *     dependency on the cloud contracts, so its literal is restated and pinned
 *     by the first test below rather than imported.
 *
 * The callback path is the redirect URI registered with every provider, so it
 * cannot move without re-registering: the route-handler check is the guard.
 */
const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');
const WEB_APP_DIR = path.resolve(import.meta.dirname, '../../app');

/**
 * Trees that hold surface HTTP clients and chat UI. A literal here can become a
 * request or a rejected Connect card; prose in docs and fixtures cannot.
 */
const SCANNED_DIRS = [
  'apps/web/lib',
  'apps/web/features',
  'apps/web/components',
  'apps/mobile/services',
  'apps/mobile/stores',
  'apps/desktop/src',
  'packages/ui/unified-chat/src',
];

/**
 * The one file allowed to restate the start path: the shared chat renderer,
 * which cannot import the contract package (see the file header). Its value is
 * asserted equal to the contract constant by the first test.
 */
const ALLOWED_RESTATEMENTS = new Set([
  'packages/ui/unified-chat/src/lib/connector-connect-required.ts',
]);

const SOURCE_EXT = /\.(ts|tsx)$/;
const SKIP_DIRS = new Set([
  'node_modules',
  '__tests__',
  '__mocks__',
  '__fixtures__',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
]);

/**
 * Matches a path only where it can become a request: opening a string literal,
 * or following a template interpolation such as `${BASE}/api/...`. Comment
 * lines are dropped first, so JSDoc may still name the endpoints — the routes
 * are documented in several places and prose cannot drift a URL.
 */
function buildLiteralMatcher(routePath: string): RegExp {
  return new RegExp(`['"\`}]${routePath.replace(/\//g, '\\/')}`);
}

function stripCommentLines(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('*') && !trimmed.startsWith('//') && !trimmed.startsWith('/*');
    })
    .join('\n');
}

function collectSourceFiles(dir: string, found: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    // A surface tree that does not exist cannot shadow the constant.
    return found;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectSourceFiles(full, found);
      continue;
    }
    if (!SOURCE_EXT.test(entry.name)) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
    found.push(full);
  }
  return found;
}

function findRetypedFiles(routePath: string): string[] {
  const matcher = buildLiteralMatcher(routePath);
  const offenders: string[] = [];
  for (const rel of SCANNED_DIRS) {
    for (const file of collectSourceFiles(path.join(REPO_ROOT, rel))) {
      const relative = path.relative(REPO_ROOT, file);
      if (ALLOWED_RESTATEMENTS.has(relative)) continue;
      if (matcher.test(stripCommentLines(fs.readFileSync(file, 'utf8')))) {
        offenders.push(relative);
      }
    }
  }
  return offenders;
}

describe('connector OAuth broker paths have one declaration', () => {
  it('pins the shared chat UI copy of the start path to the contract', () => {
    expect(
      SHARED_UI_START_PATH,
      'packages/ui/unified-chat restates the start path because it cannot depend on ' +
        '@agiworkforce/cloud-contracts. It has drifted: the Connect card validator will now ' +
        'reject genuine authorization prompts and the button will not render.',
    ).toBe(CONNECTOR_OAUTH_START_PATH);
  });

  it('resolves both paths to real Next.js route handlers', () => {
    for (const routePath of [CONNECTOR_OAUTH_START_PATH, CONNECTOR_OAUTH_CALLBACK_PATH]) {
      const routeFile = path.join(WEB_APP_DIR, routePath, 'route.ts');
      expect(
        fs.existsSync(routeFile),
        `${routePath} has no handler at ${path.relative(REPO_ROOT, routeFile)}. ` +
          'Move the constant and the route together — the callback path is also the redirect ' +
          'URI registered with every provider.',
      ).toBe(true);
      expect(fs.readFileSync(routeFile, 'utf8')).toMatch(
        /export\s+(?:const|async\s+function)\s+GET\b/,
      );
    }
  });

  it('is not retyped as a string literal by any surface client', () => {
    for (const routePath of [CONNECTOR_OAUTH_START_PATH, CONNECTOR_OAUTH_CALLBACK_PATH]) {
      const offenders = findRetypedFiles(routePath);
      expect(
        offenders,
        `These files retype ${routePath} instead of importing it from ` +
          '@agiworkforce/cloud-contracts:\n' +
          offenders.join('\n'),
      ).toEqual([]);
    }
  });
});
